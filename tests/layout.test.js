import test from 'node:test';
import assert from 'node:assert/strict';
import { A4, layoutPages } from '../site/js/layout.js';

const card = (sides = [0, 1]) => ({ widthMm: 85.6, heightMm: 54, sides });
const carLicense = (sides = [0, 1]) => ({ widthMm: 145, heightMm: 100, sides });

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} 應接近 ${expected}`);

function assertInsidePage(pages, margin = 15) {
  for (const items of pages) {
    for (const { x, y, w, h } of items) {
      assert.ok(x >= margin - 1e-6 && x + w <= A4.widthMm - margin + 1e-6, `x 超出頁面：${x}`);
      assert.ok(y >= margin - 1e-6 && y + h <= A4.heightMm - margin + 1e-6, `y 超出頁面：${y}`);
    }
  }
}

test('正反面左右並排並置中', () => {
  const pages = layoutPages([card()], { arrangement: 'row' });
  assert.equal(pages.length, 1);
  const [front, back] = pages[0];
  assert.deepEqual([front.side, back.side], [0, 1]);
  close(front.y, 15);
  close(back.y, 15);
  close(front.x, 15 + (180 - (85.6 * 2 + 8)) / 2);
  close(back.x, front.x + 85.6 + 8);
  close(front.w, 85.6);
  close(front.h, 54);
  assertInsidePage(pages);
});

test('正反面上下排列', () => {
  const pages = layoutPages([card()], { arrangement: 'column' });
  const [front, back] = pages[0];
  close(front.x, 15 + (180 - 85.6) / 2);
  close(back.x, front.x);
  close(back.y, front.y + 54 + 8);
});

test('只有正面時單獨置中', () => {
  const [[item]] = layoutPages([card([0])]);
  close(item.x, 15 + (180 - 85.6) / 2);
});

test('一頁放不下就自動換頁', () => {
  const docs = Array.from({ length: 5 }, () => card());
  const pages = layoutPages(docs, { arrangement: 'row' });
  assert.deepEqual(
    pages.map((items) => items.length),
    [8, 2],
  );
  assert.deepEqual(
    pages[1].map((item) => item.doc),
    [4, 4],
  );
  close(pages[1][0].y, 15);
  assertInsidePage(pages);
});

test('同一份證件的正反面盡量留在同一頁', () => {
  const pages = layoutPages([carLicense(), carLicense(), carLicense()], { arrangement: 'column' });
  assert.equal(pages.length, 3);
  for (const items of pages) assert.equal(new Set(items.map((item) => item.doc)).size, 1);
  assertInsidePage(pages);
});

test('放大後並排放不下時自動改成上下排列', () => {
  const pages = layoutPages([card()], { arrangement: 'row', scale: 1.5 });
  const [front, back] = pages[0];
  close(front.w, 85.6 * 1.5);
  close(back.x, front.x);
  assert.ok(back.y > front.y);
  assertInsidePage(pages);
});

test('證件比頁面大時等比縮小', () => {
  const pages = layoutPages([carLicense()], { scale: 2 });
  const [front] = pages[0];
  close(front.w, 180);
  close(front.w / front.h, 145 / 100);
  assertInsidePage(pages);
});

test('沒有照片的證件不佔版面', () => {
  assert.deepEqual(layoutPages([]), []);
  assert.deepEqual(layoutPages([card([])]), []);
  const pages = layoutPages([card([]), card([1])]);
  assert.equal(pages[0].length, 1);
  assert.equal(pages[0][0].doc, 1);
  assert.equal(pages[0][0].side, 1);
});
