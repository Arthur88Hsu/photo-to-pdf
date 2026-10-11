// 主程式：管理狀態、畫面與事件。
// 所有處理都在瀏覽器內完成，照片不會上傳（index.html 的 CSP 也禁止了任何網路連線）。
import { Cropper } from './cropper.js';
import { detectDocument } from './detect.js';
import { CUSTOM_SIZE_LIMITS, DOC_TYPES, SIDE_NAMES, SIZE_PRESETS, findPreset } from './documents.js';
import { composeWatermarkText, defaultFileName, sanitizeFileName } from './format.js';
import { defaultQuad } from './geometry.js';
import {
  canvasToJpegBytes,
  extractDocument,
  loadImageFile,
  releaseCanvas,
  rotateCanvas,
  sampleForDetection,
} from './image.js';
import { A4, layoutPages } from './layout.js';
import { buildPdf, mmToPt } from './pdf.js';
import { renderPage } from './render.js';

const CARD_DPI = 300; // 拉正後的證件影像以 300 dpi 保存
const JPEG_QUALITY = 0.88;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const formatMm = (value) => String(Number(value.toFixed(1)));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

const state = {
  docs: [],
  watermark: { text: '', withDate: false, color: '#c62828', opacity: 0.35, sizePt: 14, angle: -30, scope: 'card' },
  layout: { arrangement: 'row', scale: 1, grayscale: false, dpi: 200 },
  fileNameEdited: false,
};

let nextDocId = 1;
let nextImageId = 1;
let pdfCache = null;
let busy = false;

const el = {
  docTypes: $('#doc-types'),
  docList: $('#doc-list'),
  docEmpty: $('#doc-empty'),
  tplDoc: $('#tpl-doc'),
  tplSide: $('#tpl-side'),
  wmText: $('#wm-text'),
  wmTemplates: $('#wm-templates'),
  wmDate: $('#wm-date'),
  wmOpacity: $('#wm-opacity'),
  wmSize: $('#wm-size'),
  wmAngle: $('#wm-angle'),
  scale: $('#scale'),
  grayscale: $('#grayscale'),
  dpi: $('#dpi'),
  preview: $('#preview'),
  pageCount: $('#page-count'),
  fileName: $('#file-name'),
  download: $('#btn-download'),
  share: $('#btn-share'),
  status: $('#export-status'),
  busy: $('#busy'),
  busyText: $('#busy-text'),
  toast: $('#toast'),
};

const cropper = new Cropper($('#cropper'));

const canShareFiles = (() => {
  try {
    const probe = new File([''], 'probe.pdf', { type: 'application/pdf' });
    return Boolean(navigator.canShare && navigator.share && navigator.canShare({ files: [probe] }));
  } catch {
    return false;
  }
})();

/* ---------- 證件清單 ---------- */

function addDoc(typeId) {
  const type = DOC_TYPES.find((t) => t.id === typeId);
  const preset = findPreset(type.preset);
  const doc = {
    id: nextDocId++,
    label: type.label,
    preset: preset.id,
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    radiusMm: preset.radiusMm,
    sides: SIDE_NAMES.map((name) => ({ name, file: null, image: null, imageId: 0, rotation: 0, corners: null })),
  };
  state.docs.push(doc);
  const node = createDocElement(doc);
  el.docList.append(node);
  refreshDoc(doc);
  el.docEmpty.hidden = true;
  node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  changed();
}

function removeDoc(doc) {
  doc.sides.forEach((side) => releaseCanvas(side.image));
  state.docs = state.docs.filter((d) => d !== doc);
  docElement(doc)?.remove();
  el.docEmpty.hidden = state.docs.length > 0;
  changed();
}

function clearSide(doc, sideIndex) {
  const side = doc.sides[sideIndex];
  releaseCanvas(side.image);
  Object.assign(side, { file: null, image: null, imageId: 0, rotation: 0, corners: null });
  refreshDoc(doc);
  changed();
}

function setPreset(doc, presetId) {
  if (presetId === 'custom') {
    Object.assign(doc, { preset: 'custom', radiusMm: 0 });
  } else {
    const preset = findPreset(presetId);
    Object.assign(doc, {
      preset: preset.id,
      widthMm: preset.widthMm,
      heightMm: preset.heightMm,
      radiusMm: preset.radiusMm,
    });
  }
  refreshDoc(doc);
  changed();
}

function setCustomSize(doc, input) {
  const value = Number(input.value);
  const { min, max } = CUSTOM_SIZE_LIMITS;
  const key = input.classList.contains('doc__width') ? 'widthMm' : 'heightMm';
  if (!Number.isFinite(value) || value < min || value > max) {
    showToast(`尺寸請輸入 ${min}～${max} mm 之間的數字`);
    input.value = formatMm(doc[key]);
    return;
  }
  doc[key] = value;
  refreshDoc(doc);
  changed();
}

function docElement(doc) {
  return el.docList.querySelector(`.doc[data-doc-id="${doc.id}"]`);
}

/** 找出事件來源所屬的證件與正反面 */
function locate(target) {
  const docNode = target.closest('.doc');
  const doc = docNode && state.docs.find((d) => d.id === Number(docNode.dataset.docId));
  const sideNode = target.closest('.side');
  return { doc, sideIndex: sideNode ? Number(sideNode.dataset.side) : -1 };
}

function createDocElement(doc) {
  const node = el.tplDoc.content.firstElementChild.cloneNode(true);
  node.dataset.docId = doc.id;
  $('.doc__title', node).textContent = doc.label;

  const select = $('.doc__preset', node);
  select.setAttribute('aria-label', `${doc.label}的尺寸`);
  for (const preset of SIZE_PRESETS) {
    select.add(new Option(`${preset.label} ${formatMm(preset.widthMm)}×${formatMm(preset.heightMm)} mm`, preset.id));
  }
  select.add(new Option('自訂尺寸', 'custom'));
  $('[data-action="remove-doc"]', node).setAttribute('aria-label', `移除${doc.label}`);

  const sides = $('.doc__sides', node);
  doc.sides.forEach((side, index) => {
    const sideNode = el.tplSide.content.firstElementChild.cloneNode(true);
    sideNode.dataset.side = index;
    for (const [kind, action] of [
      ['camera', '拍照'],
      ['gallery', '選擇照片'],
    ]) {
      const input = $(`.side__input--${kind}`, sideNode);
      input.id = `photo-${doc.id}-${index}-${kind}`;
      input.setAttribute('aria-label', `${doc.label}${side.name}：${action}`);
      $$(`label[data-pick="${kind}"]`, sideNode).forEach((label) => (label.htmlFor = input.id));
    }
    $$('.side__name', sideNode).forEach((name) => (name.textContent = side.name));
    sides.append(sideNode);
  });
  return node;
}

/** 依目前狀態更新某份證件的畫面（不重建元素，避免輸入框失去焦點） */
function refreshDoc(doc) {
  const node = docElement(doc);
  if (!node) return;
  $('.doc__preset', node).value = doc.preset;
  $('.doc__custom', node).hidden = doc.preset !== 'custom';
  for (const [selector, value] of [
    ['.doc__width', doc.widthMm],
    ['.doc__height', doc.heightMm],
  ]) {
    const input = $(selector, node);
    if (document.activeElement !== input) input.value = formatMm(value);
  }
  doc.sides.forEach((side, index) => {
    const sideNode = $(`.side[data-side="${index}"]`, node);
    sideNode.style.setProperty('--aspect', `${doc.widthMm} / ${doc.heightMm}`);
    sideNode.classList.toggle('has-image', Boolean(side.image));
    const thumb = $('.side__thumb', sideNode);
    if (!side.image) {
      thumb.width = 0;
      thumb.height = 0;
      delete thumb.dataset.key;
      return;
    }
    const key = `${side.imageId}:${doc.widthMm}x${doc.heightMm}`;
    if (thumb.dataset.key === key) return;
    thumb.dataset.key = key;
    thumb.width = 360;
    thumb.height = Math.round((360 * doc.heightMm) / doc.widthMm);
    const ctx = thumb.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(side.image, 0, 0, thumb.width, thumb.height);
    thumb.setAttribute('aria-label', `${doc.label}${side.name}`);
  });
}

/* ---------- 照片處理 ---------- */

async function processFile(doc, sideIndex, file) {
  if (busy || cropper.isOpen) return;
  if (file.type && !file.type.startsWith('image/')) {
    showToast('請選擇圖片檔（JPG、PNG、HEIC 等）');
    return;
  }
  let source;
  setBusy('讀取照片中…');
  try {
    source = await loadImageFile(file);
  } catch (error) {
    console.error(error);
    showToast('無法讀取這張照片，請改用 JPG 或 PNG 格式。');
    return;
  } finally {
    setBusy(null);
  }
  const aspect = doc.widthMm / doc.heightMm;
  const detected = detectCorners(source, aspect);
  await editSide(doc, sideIndex, file, {
    source,
    corners: detected ?? defaultQuad(source.width, source.height, aspect),
    rotation: 0,
    detected: Boolean(detected),
  });
}

function detectCorners(source, aspect) {
  try {
    const { image, scaleX, scaleY } = sampleForDetection(source);
    const quad = detectDocument(image, aspect);
    return quad && quad.map(([x, y]) => [x * scaleX, y * scaleY]);
  } catch (error) {
    console.warn('自動偵測失敗', error);
    return null;
  }
}

async function adjustSide(doc, sideIndex) {
  const side = doc.sides[sideIndex];
  if (!side.file || busy || cropper.isOpen) return;
  let source;
  setBusy('讀取照片中…');
  try {
    const original = await loadImageFile(side.file);
    source = side.rotation ? rotateCanvas(original, side.rotation) : original;
    if (source !== original) releaseCanvas(original);
  } catch (error) {
    console.error(error);
    showToast('無法重新讀取照片，請重新拍攝。');
    return;
  } finally {
    setBusy(null);
  }
  await editSide(doc, sideIndex, side.file, {
    source,
    corners: side.corners.map(([x, y]) => [x * source.width, y * source.height]),
    rotation: side.rotation,
  });
}

async function editSide(doc, sideIndex, file, { source, corners, rotation, detected = false }) {
  const side = doc.sides[sideIndex];
  const result = await cropper.open({
    source,
    corners,
    rotation,
    detected,
    title: `${doc.label}・${side.name}`,
    aspect: doc.widthMm / doc.heightMm,
  });
  if (!result) return;
  setBusy('處理中…');
  await nextFrame(); // 先讓「處理中」顯示出來，再做較耗時的透視校正
  try {
    const width = Math.round((doc.widthMm / 25.4) * CARD_DPI);
    const height = Math.round((doc.heightMm / 25.4) * CARD_DPI);
    const image = extractDocument(result.source, result.corners, width, height);
    releaseCanvas(side.image);
    Object.assign(side, {
      file,
      image,
      imageId: nextImageId++,
      rotation: result.rotation,
      // 角點以相對比例保存，重新讀檔時與解析度無關
      corners: result.corners.map(([x, y]) => [x / result.source.width, y / result.source.height]),
    });
  } catch (error) {
    console.error(error);
    showToast('處理照片時發生錯誤，請重新調整四個角。');
  } finally {
    releaseCanvas(result.source);
    setBusy(null);
  }
  if (state.docs.includes(doc)) {
    refreshDoc(doc);
    changed();
  }
}

/* ---------- 預覽與輸出 ---------- */

function hasImages() {
  return state.docs.some((doc) => doc.sides.some((side) => side.image));
}

function currentPages() {
  const docs = state.docs.map((doc) => ({
    widthMm: doc.widthMm,
    heightMm: doc.heightMm,
    sides: doc.sides.flatMap((side, index) => (side.image ? [index] : [])),
  }));
  return layoutPages(docs, { scale: state.layout.scale, arrangement: state.layout.arrangement });
}

function currentWatermark() {
  const text = composeWatermarkText(state.watermark.text, { withDate: state.watermark.withDate });
  return text ? { ...state.watermark, text } : null;
}

function docLabelsWithImages() {
  return state.docs.filter((doc) => doc.sides.some((side) => side.image)).map((doc) => doc.label);
}

function currentFileName() {
  return sanitizeFileName(el.fileName.value, defaultFileName(docLabelsWithImages()));
}

let previewTimer = 0;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 60);
}

function previewDpi() {
  const width = el.preview.clientWidth || 320;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return Math.min(150, Math.max(40, (width * dpr) / (A4.widthMm / 25.4)));
}

function renderPreview() {
  const old = $$('canvas', el.preview);
  const pages = currentPages();
  if (!pages.length) {
    const empty = document.createElement('div');
    empty.className = 'preview__empty';
    empty.textContent = '加入證件照片後，這裡會顯示 A4 預覽';
    el.preview.replaceChildren(empty);
    el.pageCount.textContent = '';
  } else {
    const dpi = previewDpi();
    const watermark = currentWatermark();
    const canvases = pages.map((items, index) => {
      const canvas = renderPage(items, { docs: state.docs, dpi, watermark, grayscale: state.layout.grayscale });
      canvas.className = 'preview__page';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `第 ${index + 1} 頁預覽`);
      return canvas;
    });
    el.preview.replaceChildren(...canvases);
    el.pageCount.textContent = `共 ${pages.length} 頁`;
  }
  old.forEach(releaseCanvas);
}

async function createPdf() {
  if (pdfCache) return pdfCache;
  const pages = currentPages();
  if (!pages.length) throw new Error('請先加入至少一張證件照片');
  const watermark = currentWatermark();
  const { dpi, grayscale } = state.layout;
  const jpegPages = [];
  for (const [index, items] of pages.entries()) {
    setBusy(pages.length > 1 ? `產生 PDF 中…（${index + 1}/${pages.length}）` : '產生 PDF 中…');
    await nextFrame();
    const canvas = renderPage(items, { docs: state.docs, dpi, watermark, grayscale });
    try {
      jpegPages.push({ jpeg: await canvasToJpegBytes(canvas, JPEG_QUALITY), width: canvas.width, height: canvas.height });
    } finally {
      releaseCanvas(canvas);
    }
  }
  const name = currentFileName();
  const bytes = buildPdf(jpegPages, {
    widthPt: mmToPt(A4.widthMm),
    heightPt: mmToPt(A4.heightMm),
    title: name.replace(/\.pdf$/i, ''),
  });
  pdfCache = { blob: new Blob([bytes], { type: 'application/pdf' }), name };
  return pdfCache;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function formatBytes(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function onDownload() {
  if (busy) return;
  try {
    const { blob, name } = await createPdf();
    downloadBlob(blob, name);
    el.status.textContent = `已下載「${name}」（${formatBytes(blob.size)}）`;
  } catch (error) {
    console.error(error);
    showToast(error.message || '產生 PDF 時發生錯誤');
  } finally {
    setBusy(null);
  }
}

async function onShare() {
  if (busy) return;
  let pdf;
  try {
    pdf = await createPdf();
  } catch (error) {
    console.error(error);
    showToast(error.message || '產生 PDF 時發生錯誤');
    return;
  } finally {
    setBusy(null);
  }
  try {
    await navigator.share({ files: [new File([pdf.blob], pdf.name, { type: 'application/pdf' })], title: pdf.name });
    el.status.textContent = `已分享「${pdf.name}」`;
  } catch (error) {
    if (error.name === 'AbortError') return;
    // 產生 PDF 太久會讓瀏覽器認為不是使用者觸發的分享，此時 PDF 已備妥，再按一次即可
    if (error.name === 'NotAllowedError') showToast('PDF 已準備好，請再按一次「分享」。');
    else showToast('無法分享，請改用「下載 PDF」。');
  }
}

/* ---------- 共用狀態 ---------- */

/** 任何會影響輸出結果的變更都呼叫這裡 */
function changed() {
  pdfCache = null;
  el.status.textContent = '';
  if (!state.fileNameEdited) el.fileName.value = defaultFileName(docLabelsWithImages());
  updateButtons();
  schedulePreview();
}

function updateButtons() {
  const ready = hasImages() && !busy;
  el.download.disabled = !ready;
  el.share.disabled = !ready;
}

function setBusy(message) {
  busy = Boolean(message);
  el.busy.hidden = !busy;
  el.busyText.textContent = message || '';
  updateButtons();
}

let toastTimer = 0;
function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, 4500);
}

/* ---------- 事件綁定 ---------- */

function createIcon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon icon--lg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

for (const type of DOC_TYPES) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'type-btn';
  button.dataset.type = type.id;
  const label = document.createElement('span');
  label.textContent = type.label;
  button.append(createIcon(type.icon), label);
  el.docTypes.append(button);
}

el.docTypes.addEventListener('click', (event) => {
  const button = event.target.closest('[data-type]');
  if (button) addDoc(button.dataset.type);
});

el.docList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { doc, sideIndex } = locate(button);
  if (!doc) return;
  if (button.dataset.action === 'remove-doc') removeDoc(doc);
  if (button.dataset.action === 'adjust') adjustSide(doc, sideIndex);
  if (button.dataset.action === 'clear-side') clearSide(doc, sideIndex);
});

el.docList.addEventListener('change', (event) => {
  const target = event.target;
  const { doc, sideIndex } = locate(target);
  if (!doc) return;
  if (target.matches('.side__input')) {
    const file = target.files?.[0];
    target.value = ''; // 讓同一個檔案可以再選一次
    if (file) processFile(doc, sideIndex, file);
  } else if (target.matches('.doc__preset')) {
    setPreset(doc, target.value);
  } else if (target.matches('.doc__width, .doc__height')) {
    setCustomSize(doc, target);
  }
});

// 桌機可以直接把照片拖進正面／反面的格子
el.docList.addEventListener('dragover', (event) => {
  const side = event.target.closest('.side');
  if (!side || !event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  side.classList.add('is-dragover');
});
el.docList.addEventListener('dragleave', (event) => {
  const side = event.target.closest('.side');
  if (side && !side.contains(event.relatedTarget)) side.classList.remove('is-dragover');
});
el.docList.addEventListener('drop', (event) => {
  const side = event.target.closest('.side');
  if (!side) return;
  event.preventDefault();
  side.classList.remove('is-dragover');
  const { doc, sideIndex } = locate(side);
  const file = event.dataTransfer?.files?.[0];
  if (doc && file) processFile(doc, sideIndex, file);
});
// 檔案拖放落在其他地方時，避免瀏覽器直接開啟圖片而遺失目前的編輯內容（文字拖放不受影響）
for (const type of ['dragover', 'drop']) {
  window.addEventListener(type, (event) => {
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
  });
}

el.wmText.addEventListener('input', () => {
  state.watermark.text = el.wmText.value;
  changed();
});

el.wmTemplates.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-template]');
  if (!chip) return;
  const text = chip.dataset.template;
  el.wmText.value = text;
  state.watermark.text = text;
  el.wmText.focus();
  const start = text.indexOf('○○');
  if (start >= 0) el.wmText.setSelectionRange(start, start + 2);
  changed();
});

el.wmDate.addEventListener('change', () => {
  state.watermark.withDate = el.wmDate.checked;
  changed();
});

function bindRange(input, apply) {
  const output = $(`output[for="${input.id}"]`);
  const update = () => {
    output.textContent = apply(Number(input.value));
  };
  input.addEventListener('input', () => {
    update();
    changed();
  });
  update();
}

bindRange(el.wmOpacity, (value) => {
  state.watermark.opacity = value / 100;
  return `${value}%`;
});
bindRange(el.wmSize, (value) => {
  state.watermark.sizePt = value;
  return `${value} pt`;
});
bindRange(el.wmAngle, (value) => {
  state.watermark.angle = -value;
  return `${value}°`;
});

$$('input[name="wm-color"]').forEach((radio) =>
  radio.addEventListener('change', () => {
    state.watermark.color = radio.value;
    changed();
  }),
);
$$('input[name="wm-scope"]').forEach((radio) =>
  radio.addEventListener('change', () => {
    state.watermark.scope = radio.value;
    changed();
  }),
);
$$('input[name="arrangement"]').forEach((radio) =>
  radio.addEventListener('change', () => {
    state.layout.arrangement = radio.value;
    changed();
  }),
);
el.scale.addEventListener('change', () => {
  state.layout.scale = Number(el.scale.value);
  changed();
});
el.grayscale.addEventListener('change', () => {
  state.layout.grayscale = el.grayscale.checked;
  changed();
});
el.dpi.addEventListener('change', () => {
  state.layout.dpi = Number(el.dpi.value);
  pdfCache = null; // 只影響輸出，預覽不必重畫
});

el.fileName.addEventListener('input', () => {
  state.fileNameEdited = el.fileName.value.trim() !== '';
  pdfCache = null;
});
el.fileName.addEventListener('blur', () => {
  if (!state.fileNameEdited) el.fileName.value = defaultFileName(docLabelsWithImages());
});

el.download.addEventListener('click', onDownload);
el.share.addEventListener('click', onShare);
el.share.hidden = !canShareFiles;

// 預覽區寬度改變（旋轉手機、調整視窗）時重畫
let previewWidth = 0;
new ResizeObserver(() => {
  const width = el.preview.clientWidth;
  if (Math.abs(width - previewWidth) < 24) return;
  previewWidth = width;
  schedulePreview();
}).observe(el.preview);

changed();
