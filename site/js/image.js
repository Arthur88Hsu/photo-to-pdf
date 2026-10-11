// 瀏覽器端的影像工具：讀取照片、旋轉、裁切拉正、輸出 JPEG。
import { quadSize, warpPerspective } from './geometry.js';

/** 讀入照片的最長邊上限：手機照片動輒 4000px 以上，縮小可避免 iOS 畫布記憶體不足 */
const MAX_SOURCE_SIDE = 3000;

export function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** 立即釋放畫布記憶體（Safari 不會很快回收畫布） */
export function releaseCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

/** 讀取使用者選的照片檔（瀏覽器會依 EXIF 自動轉正），回傳縮小後的畫布 */
export async function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) throw new Error('圖片尺寸為 0');
    const scale = Math.min(1, MAX_SOURCE_SIDE / Math.max(w, h));
    const canvas = createCanvas(Math.round(w * scale), Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 順時針旋轉 0、90、180、270 度 */
export function rotateCanvas(source, degrees) {
  const turns = (((degrees / 90) % 4) + 4) % 4;
  const swap = turns % 2 === 1;
  const canvas = createCanvas(swap ? source.height : source.width, swap ? source.width : source.height);
  const ctx = canvas.getContext('2d');
  if (turns === 1) ctx.translate(source.height, 0);
  if (turns === 2) ctx.translate(source.width, source.height);
  if (turns === 3) ctx.translate(0, source.width);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

/** 取得縮小版影像資料給自動偵測使用，並回傳換算回原圖座標的比例 */
export function sampleForDetection(source, maxSide = 256) {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  releaseCanvas(canvas);
  return { image, scaleX: source.width / width, scaleY: source.height / height };
}

/**
 * 把照片中 quad（左上、右上、右下、左下）圍出的證件拉正成 outWidth × outHeight 的畫布。
 * 先用瀏覽器把該區域縮到與輸出差不多大，再做透視校正，避免大幅縮小時產生鋸齒與摩爾紋。
 */
export function extractDocument(source, quad, outWidth, outHeight) {
  const size = quadSize(quad);
  const scale = Math.min(1, outWidth / size.width, outHeight / size.height);
  const xs = quad.map((p) => p[0]);
  const ys = quad.map((p) => p[1]);
  const left = Math.max(0, Math.floor(Math.min(...xs)) - 2);
  const top = Math.max(0, Math.floor(Math.min(...ys)) - 2);
  const right = Math.min(source.width, Math.ceil(Math.max(...xs)) + 2);
  const bottom = Math.min(source.height, Math.ceil(Math.max(...ys)) + 2);
  const boxWidth = right - left;
  const boxHeight = bottom - top;
  const width = Math.max(1, Math.round(boxWidth * scale));
  const height = Math.max(1, Math.round(boxHeight * scale));

  const region = createCanvas(width, height);
  const regionCtx = region.getContext('2d', { willReadFrequently: true });
  regionCtx.imageSmoothingQuality = 'high';
  regionCtx.drawImage(source, left, top, boxWidth, boxHeight, 0, 0, width, height);
  const pixels = regionCtx.getImageData(0, 0, width, height);
  releaseCanvas(region);

  const sx = width / boxWidth;
  const sy = height / boxHeight;
  const localQuad = quad.map(([x, y]) => [(x - left) * sx, (y - top) * sy]);
  const warped = warpPerspective(pixels, localQuad, outWidth, outHeight);

  const out = createCanvas(outWidth, outHeight);
  out.getContext('2d').putImageData(new ImageData(warped.data, outWidth, outHeight), 0, 0);
  return out;
}

export function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('無法輸出圖片'))), type, quality);
  });
}

export async function canvasToJpegBytes(canvas, quality) {
  const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  return new Uint8Array(await blob.arrayBuffer());
}
