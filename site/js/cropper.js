// 裁切編輯器：在照片上拖曳四個角點對齊證件，可旋轉照片，拖曳時顯示放大鏡。
import {
  defaultQuad,
  distance,
  orderCorners,
  pointInPolygon,
  polygonArea,
  quadSize,
  rotatePoint,
} from './geometry.js';
import { createCanvas, releaseCanvas, rotateCanvas } from './image.js';

const ACCENT = '#14b8a6';
const HANDLE_RADIUS = 11; // CSS px
const HIT_RADIUS = { touch: 36, pen: 24, mouse: 20 };
const STAGE_PADDING = 28; // 讓照片邊緣的角點也拖得到
const LOUPE_SIZE = 128;
const LOUPE_ZOOM = 3; // 相對於畫面上照片的放大倍率

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function tracePolygon(ctx, points) {
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

export class Cropper {
  constructor(dialog) {
    this.dialog = dialog;
    this.stage = dialog.querySelector('.cropper__stage');
    this.canvas = dialog.querySelector('.cropper__canvas');
    this.loupe = dialog.querySelector('.cropper__loupe');
    this.title = dialog.querySelector('.cropper__title');
    this.hint = dialog.querySelector('.cropper__hint');
    this.warning = dialog.querySelector('.cropper__warning');
    this.ctx = this.canvas.getContext('2d');
    this.loupeCtx = this.loupe.getContext('2d');
    this.source = null;
    this.display = null;
    this.view = null;
    this.drag = null;
    this.resolve = null;

    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    dialog.addEventListener('click', (e) => {
      const button = e.target.closest('[data-crop-action]');
      if (button) this.onAction(button.dataset.cropAction);
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault(); // Esc：交給 finish 統一收尾
      this.finish(null);
    });
    // 對話框被其他方式關閉時也要收尾；若已重新開啟則略過延遲送達的 close 事件
    dialog.addEventListener('close', () => {
      if (!dialog.open) this.finish(null);
    });
    new ResizeObserver(() => this.layout()).observe(this.stage);
  }

  get isOpen() {
    return Boolean(this.resolve);
  }

  /**
   * 開啟編輯器。編輯器會接管 source 畫布：取消時釋放；按下確定時連同角點一起交回。
   * @returns {Promise<{source:HTMLCanvasElement, corners:number[][], rotation:number} | null>}
   */
  open({ source, corners, rotation = 0, title, aspect, detected = false }) {
    this.source = source;
    this.corners = corners.map((p) => [...p]);
    this.rotation = rotation;
    this.aspect = aspect;
    this.title.textContent = title;
    this.hint.textContent = detected
      ? '已自動找到證件邊緣，請確認四個角是否對齊'
      : '拖曳四個角，對齊證件的四個角';
    this.dialog.showModal();
    this.layout();
    this.dialog.querySelector('[data-crop-action="confirm"]').focus();
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  finish(result) {
    if (!this.resolve) return;
    const resolve = this.resolve;
    this.resolve = null;
    this.drag = null;
    this.loupe.hidden = true;
    if (this.dialog.open) this.dialog.close();
    releaseCanvas(this.display);
    this.display = null;
    if (!result) releaseCanvas(this.source);
    this.source = null;
    this.view = null;
    resolve(result);
  }

  onAction(action) {
    if (!this.source) return;
    const { width, height } = this.source;
    switch (action) {
      case 'rotate-left':
      case 'rotate-right':
        this.rotate(action === 'rotate-right');
        break;
      case 'full':
        this.corners = [
          [0, 0],
          [width, 0],
          [width, height],
          [0, height],
        ];
        this.draw();
        break;
      case 'reset':
        this.corners = defaultQuad(width, height, this.aspect);
        this.draw();
        break;
      case 'cancel':
        this.finish(null);
        break;
      case 'confirm': {
        const corners = orderCorners(this.corners);
        if (polygonArea(corners) < width * height * 0.002) {
          this.hint.textContent = '選取範圍太小，請把四個角拉到證件的四個角';
          return;
        }
        this.finish({ source: this.source, corners, rotation: this.rotation });
        break;
      }
    }
  }

  rotate(clockwise) {
    const { width, height } = this.source;
    const rotated = rotateCanvas(this.source, clockwise ? 90 : 270);
    releaseCanvas(this.source);
    this.source = rotated;
    this.corners = orderCorners(this.corners.map((p) => rotatePoint(p, width, height, clockwise)));
    this.rotation = (this.rotation + (clockwise ? 90 : 270)) % 360;
    releaseCanvas(this.display);
    this.display = null;
    this.layout();
  }

  /** 依舞台大小重新計算照片的縮放與位置 */
  layout() {
    if (!this.source || !this.dialog.open) return;
    const width = this.stage.clientWidth;
    const height = this.stage.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    const scale = Math.min(
      (width - STAGE_PADDING * 2) / this.source.width,
      (height - STAGE_PADDING * 2) / this.source.height,
    );
    this.view = {
      width,
      height,
      dpr,
      scale,
      ox: (width - this.source.width * scale) / 2,
      oy: (height - this.source.height * scale) / 2,
    };
    // 預先縮好顯示用的照片，拖曳重繪時才不會卡頓
    const dw = Math.max(1, Math.round(this.source.width * scale * dpr));
    const dh = Math.max(1, Math.round(this.source.height * scale * dpr));
    if (!this.display || this.display.width !== dw || this.display.height !== dh) {
      releaseCanvas(this.display);
      this.display = createCanvas(dw, dh);
      const ctx = this.display.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.source, 0, 0, dw, dh);
    }
    this.draw();
  }

  toScreen([x, y]) {
    const { scale, ox, oy } = this.view;
    return [ox + x * scale, oy + y * scale];
  }

  toSource([x, y]) {
    const { scale, ox, oy } = this.view;
    return [(x - ox) / scale, (y - oy) / scale];
  }

  screenCorners() {
    return this.corners.map((p) => this.toScreen(p));
  }

  draw() {
    if (!this.view) return;
    const { ctx } = this;
    const { width, height, dpr, scale, ox, oy } = this.view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(this.display, ox, oy, this.source.width * scale, this.source.height * scale);

    const points = this.screenCorners();
    // 選取範圍以外變暗
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    tracePolygon(ctx, points);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fill('evenodd');

    ctx.beginPath();
    tracePolygon(ctx, points);
    ctx.lineWidth = 2;
    ctx.strokeStyle = ACCENT;
    ctx.stroke();

    points.forEach(([x, y], i) => {
      const active = this.drag?.type === 'corner' && this.drag.index === i;
      ctx.beginPath();
      ctx.arc(x, y, active ? HANDLE_RADIUS + 4 : HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = active ? ACCENT : 'rgba(255, 255, 255, 0.92)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = ACCENT;
      ctx.stroke();
    });

    // 選取框與證件方向不符（例如證件拍成直的）時提醒旋轉
    const size = quadSize(orderCorners(this.corners));
    const ratio = size.width / size.height;
    this.warning.hidden = !((ratio > 1.15 && this.aspect < 0.87) || (ratio < 0.87 && this.aspect > 1.15));
  }

  pointerPosition(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  hitCorner(point, radius) {
    let best = -1;
    let bestDistance = radius;
    this.screenCorners().forEach((corner, i) => {
      const d = distance(corner, point);
      if (d <= bestDistance) {
        best = i;
        bestDistance = d;
      }
    });
    return best;
  }

  onPointerDown(e) {
    if (this.drag || !this.view) return;
    const point = this.pointerPosition(e);
    const index = this.hitCorner(point, HIT_RADIUS[e.pointerType] ?? 24);
    if (index >= 0) {
      const [hx, hy] = this.toScreen(this.corners[index]);
      this.drag = { type: 'corner', index, pointerId: e.pointerId, offset: [hx - point[0], hy - point[1]] };
    } else if (pointInPolygon(point, this.screenCorners())) {
      this.drag = {
        type: 'move',
        pointerId: e.pointerId,
        start: point,
        startCorners: this.corners.map((p) => [...p]),
      };
    } else {
      return;
    }
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === 'mouse') this.canvas.style.cursor = 'grabbing';
    this.onPointerMove(e);
  }

  onPointerMove(e) {
    if (!this.view) return;
    const point = this.pointerPosition(e);
    const drag = this.drag;
    if (!drag) {
      if (e.pointerType === 'mouse') {
        const overCorner = this.hitCorner(point, HIT_RADIUS.mouse) >= 0;
        const inside = !overCorner && pointInPolygon(point, this.screenCorners());
        this.canvas.style.cursor = overCorner ? 'grab' : inside ? 'move' : 'default';
      }
      return;
    }
    if (e.pointerId !== drag.pointerId) return;
    const { width, height } = this.source;
    if (drag.type === 'corner') {
      const [x, y] = this.toSource([point[0] + drag.offset[0], point[1] + drag.offset[1]]);
      this.corners[drag.index] = [clamp(x, 0, width), clamp(y, 0, height)];
      this.drawLoupe(drag.index, point);
    } else {
      const xs = drag.startCorners.map((p) => p[0]);
      const ys = drag.startCorners.map((p) => p[1]);
      const dx = clamp((point[0] - drag.start[0]) / this.view.scale, -Math.min(...xs), width - Math.max(...xs));
      const dy = clamp((point[1] - drag.start[1]) / this.view.scale, -Math.min(...ys), height - Math.max(...ys));
      this.corners = drag.startCorners.map(([x, y]) => [x + dx, y + dy]);
    }
    this.draw();
  }

  onPointerUp(e) {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    this.loupe.hidden = true;
    if (e.pointerType === 'mouse') this.canvas.style.cursor = 'grab';
    this.corners = orderCorners(this.corners);
    this.draw();
  }

  /** 拖曳角點時的放大鏡，避免手指擋住證件邊角 */
  drawLoupe(index, pointer) {
    const { dpr, scale } = this.view;
    const size = LOUPE_SIZE;
    if (this.loupe.hidden) {
      this.loupe.hidden = false;
      this.loupe.width = Math.round(size * dpr);
      this.loupe.height = Math.round(size * dpr);
    }
    // 預設放左上角，手指靠近左上角時改放右上角
    this.loupe.classList.toggle('is-right', pointer[0] < size + 48 && pointer[1] < size + 48);

    const ctx = this.loupeCtx;
    const zoom = Math.min(scale * LOUPE_ZOOM, 4);
    const [cx, cy] = this.corners[index];
    const half = size / 2 / zoom;
    const left = cx - half;
    const top = cy - half;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, size, size);
    // 只取照片範圍內的部分（部分瀏覽器不接受超出範圍的來源區域）
    const sx0 = Math.max(0, left);
    const sy0 = Math.max(0, top);
    const sx1 = Math.min(this.source.width, cx + half);
    const sy1 = Math.min(this.source.height, cy + half);
    if (sx1 > sx0 && sy1 > sy0) {
      ctx.drawImage(
        this.source,
        sx0,
        sy0,
        sx1 - sx0,
        sy1 - sy0,
        (sx0 - left) * zoom,
        (sy0 - top) * zoom,
        (sx1 - sx0) * zoom,
        (sy1 - sy0) * zoom,
      );
    }
    ctx.beginPath();
    tracePolygon(
      ctx,
      this.corners.map(([x, y]) => [(x - left) * zoom, (y - top) * zoom]),
    );
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ACCENT;
    ctx.stroke();

    const c = size / 2;
    ctx.beginPath();
    ctx.moveTo(c - 10, c);
    ctx.lineTo(c + 10, c);
    ctx.moveTo(c, c - 10);
    ctx.lineTo(c, c + 10);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
}
