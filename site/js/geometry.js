// 幾何運算：角點排序、透視轉換（homography）與影像拉正。
// 此檔不依賴 DOM，可直接在 Node.js 中測試。

/** 兩點距離 */
export function distance([x1, y1], [x2, y2]) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** 多邊形面積（鞋帶公式） */
export function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** 判斷點是否在多邊形內（射線法） */
export function pointInPolygon([px, py], points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * 依畫面位置把四個點排成「左上、右上、右下、左下」（順時針）。
 * 使用者拖曳時可能讓角點交錯，排序後可避免輸出翻轉或扭曲。
 */
export function orderCorners(points) {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  // 畫面座標 y 軸向下，atan2 由小到大即為順時針
  const sorted = [...points].sort(
    (p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx),
  );
  let start = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i][0] + sorted[i][1] < sorted[start][0] + sorted[start][1]) start = i;
  }
  return sorted.map((_, i) => [...sorted[(start + i) % sorted.length]]);
}

/** 四邊形的平均寬高（上下邊平均、左右邊平均） */
export function quadSize([tl, tr, br, bl]) {
  return {
    width: (distance(tl, tr) + distance(bl, br)) / 2,
    height: (distance(tl, bl) + distance(tr, br)) / 2,
  };
}

/** 圖片中央、符合指定長寬比的預設選取框 */
export function defaultQuad(width, height, aspect, fill = 0.8) {
  let w = width * fill;
  let h = w / aspect;
  if (h > height * fill) {
    h = height * fill;
    w = h * aspect;
  }
  const x = (width - w) / 2;
  const y = (height - h) / 2;
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

/** 影像旋轉 90° 後點的新座標；width、height 為旋轉前的影像尺寸 */
export function rotatePoint([x, y], width, height, clockwise) {
  return clockwise ? [height - y, x] : [y, width - x];
}

/**
 * 計算單位正方形 (0,0)(1,0)(1,1)(0,1) 映射到四邊形（左上、右上、右下、左下）的投影轉換。
 * 參考 Heckbert, "Fundamentals of Texture Mapping and Image Warping" (1989)。
 */
export function squareToQuad([[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-9) throw new Error('四個角點不能在同一直線上');
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  return {
    a: x1 - x0 + g * x1,
    b: x3 - x0 + h * x3,
    c: x0,
    d: y1 - y0 + g * y1,
    e: y3 - y0 + h * y3,
    f: y0,
    g,
    h,
  };
}

/** 套用 squareToQuad 的結果，把 (u, v) ∈ [0,1]² 映射到四邊形內的座標 */
export function mapPoint({ a, b, c, d, e, f, g, h }, u, v) {
  const w = g * u + h * v + 1;
  return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
}

/**
 * 透視校正：把來源影像中 quad 圍出的範圍拉正成 outWidth × outHeight 的矩形影像。
 * src 為 ImageData 形式的物件 { width, height, data }，以雙線性內插取樣。
 */
export function warpPerspective(src, quad, outWidth, outHeight) {
  const { a, b, c, d, e, f, g, h } = squareToQuad(quad);
  const { width: sw, height: sh, data: sd } = src;
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);
  const maxX = sw - 1;
  const maxY = sh - 1;
  const du = 1 / outWidth;
  let o = 0;
  for (let y = 0; y < outHeight; y++) {
    const v = (y + 0.5) / outHeight;
    // 分子、分母對 u 是線性的，沿著一列逐像素累加即可
    let nx = a * 0.5 * du + b * v + c;
    let ny = d * 0.5 * du + e * v + f;
    let nw = g * 0.5 * du + h * v + 1;
    for (let x = 0; x < outWidth; x++, nx += a * du, ny += d * du, nw += g * du, o += 4) {
      const fx = nx / nw - 0.5;
      const fy = ny / nw - 0.5;
      let x0 = Math.floor(fx);
      let y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      let x1 = x0 + 1;
      let y1 = y0 + 1;
      x0 = x0 < 0 ? 0 : x0 > maxX ? maxX : x0;
      x1 = x1 < 0 ? 0 : x1 > maxX ? maxX : x1;
      y0 = y0 < 0 ? 0 : y0 > maxY ? maxY : y0;
      y1 = y1 < 0 ? 0 : y1 > maxY ? maxY : y1;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      for (let k = 0; k < 3; k++) {
        const top = sd[i00 + k] + (sd[i10 + k] - sd[i00 + k]) * tx;
        const bottom = sd[i01 + k] + (sd[i11 + k] - sd[i01 + k]) * tx;
        out[o + k] = top + (bottom - top) * ty;
      }
      out[o + 3] = 255;
    }
  }
  return { width: outWidth, height: outHeight, data: out };
}
