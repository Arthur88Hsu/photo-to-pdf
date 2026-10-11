// A4 版面配置：把每張證件以實際尺寸（mm）排進頁面，放不下就換頁。
// 此檔不依賴 DOM，可直接在 Node.js 中測試。

export const A4 = { widthMm: 210, heightMm: 297 };

const EPSILON = 1e-6;

/**
 * @param {Array<{widthMm:number, heightMm:number, sides:number[]}>} docs
 *   每份證件的尺寸，以及有照片的面（例如 [0, 1] 代表正反面都有）
 * @param {object} [options]
 * @param {number} [options.scale=1] 放大倍率，1 為實際大小
 * @param {'row'|'column'} [options.arrangement='row'] row：正反面左右並排；column：上下排列
 * @param {number} [options.margin=15] 頁面邊界（mm）
 * @param {number} [options.gap=8] 同一份證件正反面的間距（mm）
 * @param {number} [options.groupGap=14] 不同證件之間的間距（mm）
 * @returns {Array<Array<{doc:number, side:number, x:number, y:number, w:number, h:number}>>}
 *   每一頁的擺放位置，單位 mm，原點在頁面左上角
 */
export function layoutPages(docs, options = {}) {
  const {
    scale = 1,
    arrangement = 'row',
    page = A4,
    margin = 15,
    gap = 8,
    groupGap = 14,
  } = options;
  const contentWidth = page.widthMm - margin * 2;
  const contentHeight = page.heightMm - margin * 2;

  const pages = [];
  let items = [];
  let y = 0; // 目前頁面已使用的高度（從內容區頂端算起）

  const newPage = () => {
    if (items.length) pages.push(items);
    items = [];
    y = 0;
  };

  docs.forEach((doc, docIndex) => {
    if (!doc.sides.length) return;
    // 證件比頁面還大時（例如放大後的行照）等比縮小到放得下
    const fit = Math.min(1, contentWidth / (doc.widthMm * scale), contentHeight / (doc.heightMm * scale));
    const w = doc.widthMm * scale * fit;
    const h = doc.heightMm * scale * fit;

    const rowWidth = doc.sides.length * w + (doc.sides.length - 1) * gap;
    const rows =
      arrangement === 'row' && rowWidth <= contentWidth + EPSILON
        ? [doc.sides]
        : doc.sides.map((side) => [side]);

    // 盡量讓同一份證件的正反面留在同一頁
    const blockHeight = rows.length * h + (rows.length - 1) * gap;
    if (items.length && y + groupGap + blockHeight > contentHeight + EPSILON && blockHeight <= contentHeight) {
      newPage();
    }

    rows.forEach((row, rowIndex) => {
      if (items.length) {
        const spacing = rowIndex === 0 ? groupGap : gap;
        if (y + spacing + h > contentHeight + EPSILON) newPage();
        else y += spacing;
      }
      const width = row.length * w + (row.length - 1) * gap;
      let x = margin + (contentWidth - width) / 2;
      for (const side of row) {
        items.push({ doc: docIndex, side, x, y: margin + y, w, h });
        x += w + gap;
      }
      y += h;
    });
  });

  newPage();
  return pages;
}
