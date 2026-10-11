import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOC_TYPES, SIZE_PRESETS, findPreset } from '../site/js/documents.js';

const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');

test('每種證件都有有效的尺寸、至少一面，且圖示存在', () => {
  assert.equal(new Set(DOC_TYPES.map((type) => type.id)).size, DOC_TYPES.length, '證件 id 不可重複');
  for (const type of DOC_TYPES) {
    assert.ok(findPreset(type.preset), `${type.label} 的尺寸 ${type.preset} 不存在`);
    assert.ok(type.sides.length >= 1, `${type.label} 至少要有一面`);
    assert.ok(html.includes(`<symbol id="${type.icon}"`), `${type.label} 的圖示 ${type.icon} 不存在`);
  }
  for (const preset of SIZE_PRESETS) assert.ok(preset.widthMm > 0 && preset.heightMm > 0);
});

test('存摺只有封面、沒有反面', () => {
  const passbook = DOC_TYPES.find((type) => type.id === 'passbook');
  assert.deepEqual(passbook.sides, ['封面']);
  const size = findPreset(passbook.preset);
  assert.ok(size.widthMm > size.heightMm, '存摺預設為橫式');
});
