import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultQuad,
  mapPoint,
  orderCorners,
  pointInPolygon,
  polygonArea,
  quadSize,
  rotatePoint,
  squareToQuad,
  warpPerspective,
} from '../site/js/geometry.js';

const close = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} 應接近 ${expected}`);

/** 產生 r = x、g = y 的測試影像，方便驗證取樣位置 */
function coordinateImage(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = x;
      data[i + 1] = y;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

test('orderCorners 依畫面位置排成左上、右上、右下、左下', () => {
  const shuffled = [
    [90, 80],
    [10, 12],
    [12, 85],
    [95, 5],
  ];
  assert.deepEqual(orderCorners(shuffled), [
    [10, 12],
    [95, 5],
    [90, 80],
    [12, 85],
  ]);
});

test('squareToQuad 把單位正方形的四角映射到四邊形的四角', () => {
  const quad = [
    [12, 20],
    [180, 8],
    [200, 150],
    [5, 120],
  ];
  const m = squareToQuad(quad);
  const corners = [mapPoint(m, 0, 0), mapPoint(m, 1, 0), mapPoint(m, 1, 1), mapPoint(m, 0, 1)];
  corners.forEach((p, i) => {
    close(p[0], quad[i][0]);
    close(p[1], quad[i][1]);
  });

  // 投影轉換保留直線：正方形中心會落在四邊形兩條對角線的交點
  const [cx, cy] = mapPoint(m, 0.5, 0.5);
  const [[x0, y0], , [x2, y2]] = quad;
  const [, [x1, y1], , [x3, y3]] = quad;
  const cross = (ax, ay, bx, by) => ax * by - ay * bx;
  close(cross(x2 - x0, y2 - y0, cx - x0, cy - y0), 0, 1e-6);
  close(cross(x3 - x1, y3 - y1, cx - x1, cy - y1), 0, 1e-6);
});

test('squareToQuad 遇到退化的四邊形會丟出錯誤', () => {
  assert.throws(() =>
    squareToQuad([
      [0, 0],
      [10, 0],
      [20, 0],
      [30, 0],
    ]),
  );
});

test('warpPerspective 對齊軸向的矩形會完整取出原像素', () => {
  const src = coordinateImage(100, 100);
  const quad = [
    [10, 20],
    [60, 20],
    [60, 70],
    [10, 70],
  ];
  const out = warpPerspective(src, quad, 50, 50);
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const i = (y * 50 + x) * 4;
      assert.equal(out.data[i], 10 + x);
      assert.equal(out.data[i + 1], 20 + y);
      assert.equal(out.data[i + 3], 255);
    }
  }
});

test('warpPerspective 透視變形時，每個輸出像素都取樣在正確位置', () => {
  const src = coordinateImage(240, 240);
  const quad = [
    [30, 40],
    [200, 20],
    [220, 210],
    [15, 190],
  ];
  const width = 64;
  const height = 40;
  const out = warpPerspective(src, quad, width, height);
  const m = squareToQuad(quad);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [sx, sy] = mapPoint(m, (x + 0.5) / width, (y + 0.5) / height);
      const i = (y * width + x) * 4;
      // 線性漸層經雙線性內插後應等於取樣位置本身（差距在四捨五入範圍內）
      close(out.data[i], sx - 0.5, 0.51);
      close(out.data[i + 1], sy - 0.5, 0.51);
    }
  }
});

test('quadSize、polygonArea 與 pointInPolygon', () => {
  const quad = [
    [0, 0],
    [40, 0],
    [40, 20],
    [0, 20],
  ];
  assert.deepEqual(quadSize(quad), { width: 40, height: 20 });
  assert.equal(polygonArea(quad), 800);
  assert.equal(pointInPolygon([10, 10], quad), true);
  assert.equal(pointInPolygon([50, 10], quad), false);
});

test('defaultQuad 置中且符合長寬比', () => {
  const quad = defaultQuad(1000, 800, 85.6 / 54);
  const { width, height } = quadSize(quad);
  close(width / height, 85.6 / 54);
  close(width, 800);
  close(quad[0][0] + quad[2][0], 1000);
  close(quad[0][1] + quad[2][1], 800);
});

test('rotatePoint 順時針、逆時針旋轉 90°', () => {
  // 寬 100、高 50 的影像
  assert.deepEqual(rotatePoint([0, 0], 100, 50, true), [50, 0]);
  assert.deepEqual(rotatePoint([100, 50], 100, 50, true), [0, 100]);
  assert.deepEqual(rotatePoint([100, 0], 100, 50, false), [0, 0]);
  assert.deepEqual(rotatePoint([0, 50], 100, 50, false), [50, 100]);
});
