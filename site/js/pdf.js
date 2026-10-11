// 極簡 PDF 產生器：每一頁放一張滿版 JPEG。
// JPEG 可以原封不動地以 DCTDecode 嵌入 PDF，所以不需要任何第三方函式庫。
// 浮水印與證件影像在畫布上就已合成，PDF 內只有影像，浮水印無法被單獨刪除。
// 此檔不依賴 DOM，可直接在 Node.js 中測試。

const encoder = new TextEncoder();

/** 公釐轉 PDF 點數（1 pt = 1/72 inch） */
export function mmToPt(mm) {
  return (mm / 25.4) * 72;
}

/** PDF 文字字串：以 UTF-16BE（含 BOM）十六進位表示，可放中文 */
export function pdfTextString(text) {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++) {
    hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  }
  return `<${hex}>`;
}

/** PDF 日期格式，例如 D:20261011143000+08'00' */
export function pdfDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return (
    `D:${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}'${pad(abs % 60)}'`
  );
}

function formatNumber(n) {
  return Number(n.toFixed(2)).toString();
}

/**
 * @param {Array<{jpeg:Uint8Array, width:number, height:number}>} pages 每頁的 JPEG 與其像素尺寸
 * @param {object} options
 * @param {number} options.widthPt  頁面寬度（pt）
 * @param {number} options.heightPt 頁面高度（pt）
 * @param {string} [options.title]
 * @param {Date} [options.date]
 * @returns {Uint8Array}
 */
export function buildPdf(pages, { widthPt, heightPt, title = '', date = new Date() }) {
  if (!pages.length) throw new Error('沒有任何頁面');
  const chunks = [];
  const offsets = [];
  let length = 0;
  const write = (data) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const startObject = (id) => {
    offsets[id] = length;
    write(`${id} 0 obj\n`);
  };

  // 物件編號：1 目錄、2 頁面樹、3 文件資訊，之後每頁依序為 頁面、影像、內容 三個物件
  const pageId = (i) => 4 + i * 3;
  const objectCount = 3 + pages.length * 3;

  // 檔頭第二行放幾個大於 127 的位元組，讓傳輸工具把檔案當成二進位
  write('%PDF-1.4\n');
  write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  startObject(1);
  write('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  startObject(2);
  const kids = pages.map((_, i) => `${pageId(i)} 0 R`).join(' ');
  write(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);

  startObject(3);
  const info = [`/Producer (photo-to-pdf)`, `/CreationDate (${pdfDate(date)})`];
  if (title) info.push(`/Title ${pdfTextString(title)}`);
  write(`<< ${info.join(' ')} >>\nendobj\n`);

  const w = formatNumber(widthPt);
  const h = formatNumber(heightPt);
  pages.forEach((page, i) => {
    const id = pageId(i);
    startObject(id);
    write(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
        `/Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>\nendobj\n`,
    );

    startObject(id + 1);
    write(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
    );
    write(page.jpeg);
    write('\nendstream\nendobj\n');

    const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;
    startObject(id + 2);
    write(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream\nendobj\n`);
  });

  const xrefOffset = length;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objectCount; id++) {
    xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  write(xref);
  write(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}
