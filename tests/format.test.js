import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composeWatermarkText,
  defaultFileName,
  formatDate,
  formatDateCompact,
  sanitizeFileName,
} from '../site/js/format.js';

const date = new Date(2026, 9, 11);

test('日期格式', () => {
  assert.equal(formatDate(date), '2026/10/11');
  assert.equal(formatDateCompact(new Date(2026, 0, 5)), '20260105');
});

test('浮水印文字會整理空白，並可加上日期', () => {
  assert.equal(composeWatermarkText('  僅供   開戶使用 '), '僅供 開戶使用');
  assert.equal(composeWatermarkText('僅供開戶使用', { withDate: true, date }), '僅供開戶使用 2026/10/11');
  assert.equal(composeWatermarkText('   ', { withDate: true, date }), '');
  assert.equal(composeWatermarkText(undefined), '');
});

test('預設檔名依證件名稱產生且不重複', () => {
  assert.equal(defaultFileName(['身分證', '健保卡', '身分證'], date), '身分證_健保卡_影本_20261011.pdf');
  assert.equal(defaultFileName([], date), '證件_影本_20261011.pdf');
});

test('檔名會移除不合法字元並補上 .pdf', () => {
  assert.equal(sanitizeFileName('a/b:c*d', 'x.pdf'), 'a_b_c_d.pdf');
  assert.equal(sanitizeFileName('報告.PDF', 'x.pdf'), '報告.PDF');
  assert.equal(sanitizeFileName('  ', 'x.pdf'), 'x.pdf');
  assert.equal(sanitizeFileName('.pdf', 'x.pdf'), 'x.pdf');
});
