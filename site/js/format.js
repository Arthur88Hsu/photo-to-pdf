// 文字相關的小工具：日期、浮水印文字、檔名。
// 此檔不依賴 DOM，可直接在 Node.js 中測試。

const pad = (n) => String(n).padStart(2, '0');

/** 2026/10/11 */
export function formatDate(date) {
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

/** 20261011 */
export function formatDateCompact(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** 整理使用者輸入的浮水印文字，可選擇在後面加上日期；沒有文字時回傳空字串 */
export function composeWatermarkText(text, { withDate = false, date = new Date() } = {}) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  return withDate ? `${clean} ${formatDate(date)}` : clean;
}

/** 依證件名稱產生預設檔名，例如「身分證_健保卡_影本_20261011.pdf」 */
export function defaultFileName(labels, date = new Date()) {
  const unique = [...new Set(labels)];
  const prefix = unique.length ? unique.join('_') : '證件';
  return `${prefix}_影本_${formatDateCompact(date)}.pdf`;
}

/** 移除檔名中不合法的字元，並確保副檔名為 .pdf */
export function sanitizeFileName(name, fallback) {
  let clean = String(name ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim();
  if (!clean || /^\.pdf$/i.test(clean)) clean = fallback;
  if (!/\.pdf$/i.test(clean)) clean += '.pdf';
  return clean;
}
