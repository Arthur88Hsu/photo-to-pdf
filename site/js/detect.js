// 自動偵測照片中證件的四個角（輕量版，不需任何函式庫）。
// 作法：灰階 → 模糊 → Otsu 二值化 → 找出最大且不碰到照片邊緣的區塊 → 取四個對角方向的極值點。
// 證件與背景顏色太接近時會偵測失敗並回傳 null，此時改由使用者手動拖曳角點。
// 此檔不依賴 DOM，可直接在 Node.js 中測試。
import { polygonArea, quadSize } from './geometry.js';

/**
 * @param {{width:number, height:number, data:Uint8ClampedArray}} image 已縮小的影像（建議長邊約 256px）
 * @param {number} aspect 證件的寬高比，用來排除形狀差太多的區塊
 * @returns {number[][] | null} 左上、右上、右下、左下四個角（影像座標）
 */
export function detectDocument(image, aspect) {
  const { width: w, height: h, data } = image;
  if (w < 16 || h < 16) return null;
  const n = w * h;
  const gray = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    gray[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  }
  const blurred = boxBlur(boxBlur(gray, w, h), w, h);
  const threshold = otsuThreshold(blurred);

  let best = null;
  // 證件可能比背景亮，也可能比背景暗，兩種都試
  for (const bright of [true, false]) {
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) mask[i] = blurred[i] > threshold === bright ? 1 : 0;
    const candidate = evaluateLargestRegion(mask, w, h, aspect);
    if (candidate && (!best || candidate.area > best.area)) best = candidate;
  }
  return best ? best.quad : null;
}

function evaluateLargestRegion(mask, w, h, aspect) {
  const n = w * h;
  const { label, regions } = labelRegions(mask, w, h);
  const borderLimit = 0.02 * 2 * (w + h);
  const region = regions
    .filter((r) => r.border <= borderLimit)
    .reduce((max, r) => (!max || r.count > max.count ? r : max), null);
  if (!region) return null;

  // 極值點落在像素中心，往外推半個像素貼齊邊緣
  const quad = [
    [region.tl[0], region.tl[1]],
    [region.tr[0] + 1, region.tr[1]],
    [region.br[0] + 1, region.br[1] + 1],
    [region.bl[0], region.bl[1] + 1],
  ];
  const area = polygonArea(quad);
  if (area < 0.05 * n || area > 0.95 * n) return null;

  // 四邊形應該要被區塊（含內部的文字、照片等孔洞）填滿
  const fill = solidArea(label, region.id, w, h) / area;
  if (fill < 0.88 || fill > 1.12) return null;

  // 長寬比要接近證件（允許證件被拍成直的）
  const { width: qw, height: qh } = quadSize(quad);
  if (Math.min(qw, qh) < 8) return null;
  const ratio = qw / qh;
  const tolerance = Math.log(1.3);
  if (Math.abs(Math.log(ratio / aspect)) > tolerance && Math.abs(Math.log(ratio * aspect)) > tolerance) {
    return null;
  }
  return { quad, area };
}

/** 4 連通區塊標記，同時記錄每個區塊在四個對角方向的極值點 */
function labelRegions(mask, w, h) {
  const n = w * h;
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  const regions = [];
  for (let start = 0; start < n; start++) {
    if (!mask[start] || label[start]) continue;
    const id = regions.length + 1;
    const r = { id, count: 0, border: 0, tl: null, tr: null, br: null, bl: null };
    let minSum = Infinity;
    let maxSum = -Infinity;
    let minDiff = Infinity;
    let maxDiff = -Infinity;
    let sp = 0;
    const visit = (p) => {
      if (mask[p] && !label[p]) {
        label[p] = id;
        stack[sp++] = p;
      }
    };
    visit(start);
    while (sp) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      r.count++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) r.border++;
      const sum = x + y;
      const diff = x - y;
      if (sum < minSum) {
        minSum = sum;
        r.tl = [x, y];
      }
      if (sum > maxSum) {
        maxSum = sum;
        r.br = [x, y];
      }
      if (diff > maxDiff) {
        maxDiff = diff;
        r.tr = [x, y];
      }
      if (diff < minDiff) {
        minDiff = diff;
        r.bl = [x, y];
      }
      if (x > 0) visit(p - 1);
      if (x < w - 1) visit(p + 1);
      if (y > 0) visit(p - w);
      if (y < h - 1) visit(p + w);
    }
    regions.push(r);
  }
  return { label, regions };
}

/** 區塊面積（含被它包住的孔洞）：從照片邊緣灌水，灌不到的地方都算區塊的一部分 */
function solidArea(label, id, w, h) {
  const n = w * h;
  const outside = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  const push = (p) => {
    if (label[p] !== id && !outside[p]) {
      outside[p] = 1;
      stack[sp++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  let reached = 0;
  while (sp) {
    const p = stack[--sp];
    reached++;
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < n - w) push(p + w);
  }
  return n - reached;
}

/** 3×3 平均模糊（可分離） */
function boxBlur(src, w, h) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const left = x > 0 ? x - 1 : x;
      const right = x < w - 1 ? x + 1 : x;
      tmp[row + x] = (src[row + left] + src[row + x] + src[row + right]) / 3;
    }
  }
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : y) * w;
    const row = y * w;
    const down = (y < h - 1 ? y + 1 : y) * w;
    for (let x = 0; x < w; x++) out[row + x] = (tmp[up + x] + tmp[row + x] + tmp[down + x]) / 3;
  }
  return out;
}

/** Otsu 自動門檻：找出讓前景、背景兩群差異最大的灰階值 */
export function otsuThreshold(values) {
  const hist = new Float64Array(256);
  for (const v of values) hist[v < 0 ? 0 : v > 255 ? 255 : Math.round(v)]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let weightB = 0;
  let bestVariance = -1;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    weightB += hist[t];
    if (!weightB) continue;
    const weightF = total - weightB;
    if (!weightF) break;
    sumB += t * hist[t];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = t;
    }
  }
  return threshold;
}
