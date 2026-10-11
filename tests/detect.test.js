import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDocument, otsuThreshold } from '../site/js/detect.js';
import { distance, pointInPolygon } from '../site/js/geometry.js';

const ASPECT = 85.6 / 54;

/** 畫一張合成照片：深色背景上有一張淺色證件（含深色的照片與文字區塊） */
function syntheticPhoto(width, height, card, { background = 50, cardValue = 225, noise = 12 } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 42;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  // 證件內部的深色區塊（以證件座標 u、v ∈ [0,1] 表示）
  const darkBlocks = [
    [0.06, 0.2, 0.3, 0.8], // 大頭照
    [0.4, 0.2, 0.92, 0.28], // 文字
    [0.4, 0.4, 0.85, 0.47],
    [0.4, 0.6, 0.7, 0.67],
  ];
  const [tl, tr, , bl] = card;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = [x + 0.5, y + 0.5];
      let value = background;
      if (pointInPolygon(p, card)) {
        value = cardValue;
        // 近似的證件內部座標（測試用，夠準即可）
        const u = ((p[0] - tl[0]) * (tr[0] - tl[0]) + (p[1] - tl[1]) * (tr[1] - tl[1])) / distance(tl, tr) ** 2;
        const v = ((p[0] - tl[0]) * (bl[0] - tl[0]) + (p[1] - tl[1]) * (bl[1] - tl[1])) / distance(tl, bl) ** 2;
        if (darkBlocks.some(([u0, v0, u1, v1]) => u >= u0 && u <= u1 && v >= v0 && v <= v1)) value = 70;
      }
      value += (random() - 0.5) * noise;
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

function assertCornersNear(actual, expected, tolerance) {
  assert.ok(actual, '應該要偵測到證件');
  actual.forEach((p, i) => {
    const d = distance(p, expected[i]);
    assert.ok(d <= tolerance, `第 ${i} 個角偏差 ${d.toFixed(2)}px，超過 ${tolerance}px`);
  });
}

test('偵測正放的證件', () => {
  const card = [
    [40, 50],
    [200, 50],
    [200, 151],
    [40, 151],
  ];
  const quad = detectDocument(syntheticPhoto(256, 192, card), ASPECT);
  assertCornersNear(quad, card, 3);
});

test('偵測斜拍（透視變形、略為旋轉）的證件', () => {
  const card = [
    [52, 40],
    [205, 58],
    [196, 160],
    [35, 138],
  ];
  const quad = detectDocument(syntheticPhoto(256, 192, card), ASPECT);
  assertCornersNear(quad, card, 4);
});

test('偵測深色背景在亮處、證件較暗的情況', () => {
  const card = [
    [60, 40],
    [210, 40],
    [210, 135],
    [60, 135],
  ];
  const image = syntheticPhoto(256, 192, card, { background: 230, cardValue: 90 });
  assertCornersNear(detectDocument(image, ASPECT), card, 3);
});

test('畫面中沒有明顯的證件時回傳 null', () => {
  const blank = syntheticPhoto(200, 150, [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ]);
  assert.equal(detectDocument(blank, ASPECT), null);
});

test('形狀與證件差太多（例如正方形）時回傳 null', () => {
  const square = [
    [60, 30],
    [160, 30],
    [160, 130],
    [60, 130],
  ];
  assert.equal(detectDocument(syntheticPhoto(220, 160, square), ASPECT), null);
});

test('otsuThreshold 落在兩群數值之間', () => {
  const values = [...Array(500).fill(40), ...Array(500).fill(200)];
  const t = otsuThreshold(values);
  assert.ok(t >= 40 && t < 200, `門檻 ${t}`);
});
