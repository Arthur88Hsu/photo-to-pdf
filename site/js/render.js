// 在畫布上合成 A4 頁面：白底 → 證件影像（實際尺寸）→ 浮水印 →（選用）轉黑白。
// 預覽與輸出 PDF 共用同一段程式，只差在解析度（dpi）。
import { A4 } from './layout.js';

const WATERMARK_FONT =
  '"PingFang TC", "Heiti TC", "Microsoft JhengHei", "Noto Sans TC", "Noto Sans CJK TC", ' +
  '"WenQuanYi Zen Hei", sans-serif';
const CARD_BORDER_COLOR = 'rgba(0, 0, 0, 0.18)';

/**
 * @param {Array<{doc:number, side:number, x:number, y:number, w:number, h:number}>} items 這一頁的擺放位置（mm）
 * @param {object} options
 * @param {Array} options.docs 證件資料，對應 items 的 doc / side 索引
 * @param {number} options.dpi 解析度
 * @param {{text:string, color:string, opacity:number, sizePt:number, angle:number, scope:'card'|'page'}} [options.watermark]
 * @param {boolean} [options.grayscale]
 */
export function renderPage(items, { docs, dpi, watermark, grayscale = false, page = A4 }) {
  const k = dpi / 25.4; // 每 mm 的像素數
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(page.widthMm * k);
  canvas.height = Math.round(page.heightMm * k);
  const ctx = canvas.getContext('2d', { willReadFrequently: grayscale });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const hasWatermark = Boolean(watermark && watermark.text);
  const style = hasWatermark ? { ...watermark, fontPx: (watermark.sizePt / 72) * dpi } : null;

  for (const item of items) {
    const doc = docs[item.doc];
    const image = doc.sides[item.side].image;
    const rect = { x: item.x * k, y: item.y * k, w: item.w * k, h: item.h * k };
    rect.radius = doc.radiusMm * (item.w / doc.widthMm) * k;

    ctx.save();
    roundRectPath(ctx, rect);
    ctx.clip();
    ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();

    // 細框讓白色證件在白紙上也看得出邊緣
    ctx.save();
    roundRectPath(ctx, rect);
    ctx.lineWidth = Math.max(1, 0.2 * k);
    ctx.strokeStyle = CARD_BORDER_COLOR;
    ctx.stroke();
    ctx.restore();

    if (hasWatermark && watermark.scope !== 'page') drawWatermark(ctx, rect, style);
  }
  if (hasWatermark && watermark.scope === 'page') {
    drawWatermark(ctx, { x: 0, y: 0, w: canvas.width, h: canvas.height, radius: 0 }, style);
  }
  if (grayscale) toGrayscale(ctx, canvas.width, canvas.height);
  return canvas;
}

/** 在指定範圍內斜向重複繪製浮水印文字 */
export function drawWatermark(ctx, rect, { text, color, opacity, fontPx, angle }) {
  const { x, y, w, h } = rect;
  ctx.save();
  roundRectPath(ctx, rect);
  ctx.clip();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.font = `600 ${fontPx}px ${WATERMARK_FONT}`;
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const stepX = ctx.measureText(text).width + fontPx * 2;
  const stepY = fontPx * 2.6;
  // 旋轉後要蓋滿整個範圍，所以以對角線長度為半徑鋪滿
  const reach = Math.hypot(w, h) / 2 + stepX;
  let row = 0;
  for (let ty = -reach; ty <= reach; ty += stepY, row++) {
    const shift = row % 2 ? stepX / 2 : 0;
    for (let tx = -reach - shift; tx <= reach; tx += stepX) ctx.fillText(text, tx, ty);
  }
  ctx.restore();
}

function roundRectPath(ctx, { x, y, w, h, radius = 0 }) {
  ctx.beginPath();
  const r = Math.min(radius, w / 2, h / 2);
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 轉成黑白；分段處理以降低大尺寸頁面的記憶體用量 */
function toGrayscale(ctx, width, height) {
  const band = 256;
  for (let top = 0; top < height; top += band) {
    const rows = Math.min(band, height - top);
    const image = ctx.getImageData(0, top, width, rows);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = luma;
      data[i + 1] = luma;
      data[i + 2] = luma;
    }
    ctx.putImageData(image, 0, top);
  }
}
