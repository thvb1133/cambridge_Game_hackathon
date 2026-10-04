// The drawing surface. Pointer events only, so a mouse, a trackpad, a stylus
// and a finger all take the same path — at a hackathon the thing people reach
// for is a phone, and a mouse-only pad would lose half the room.
//
// It owns nothing but strokes: recognition lives in core/sketch.js so the same
// doodle can be replayed in a test without a browser.

const STROKE_WIDTH = 3;
const MIN_POINT_DISTANCE = 1.5;

export class SketchPad {
  constructor(canvas, { onChange = () => {} } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.onChange = onChange;
    this.strokes = [];
    this.active = null;
    this.colour = '#f4f0ff';

    canvas.addEventListener('pointerdown', (event) => this.begin(event));
    canvas.addEventListener('pointermove', (event) => this.extend(event));
    for (const name of ['pointerup', 'pointercancel', 'pointerleave']) {
      canvas.addEventListener(name, () => this.end());
    }
    // Stop a drag on the pad from scrolling the page underneath it.
    canvas.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
  }

  // The canvas is laid out in CSS pixels but drawn in device pixels; resize
  // on open so the backing store matches whatever the panel ended up being.
  fit() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const { clientWidth, clientHeight } = this.canvas;
    this.canvas.width = Math.max(1, Math.round(clientWidth * ratio));
    this.canvas.height = Math.max(1, Math.round(clientHeight * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.repaint();
  }

  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  begin(event) {
    this.canvas.setPointerCapture?.(event.pointerId);
    this.active = [this.point(event)];
    this.strokes.push(this.active);
  }

  extend(event) {
    if (!this.active) return;
    const point = this.point(event);
    const last = this.active[this.active.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) < MIN_POINT_DISTANCE) return;
    this.active.push(point);
    this.repaint();
  }

  end() {
    if (!this.active) return;
    // A tap that never moved is not a stroke.
    if (this.active.length < 2) this.strokes.pop();
    this.active = null;
    this.onChange(this.strokes);
  }

  undo() {
    this.strokes.pop();
    this.repaint();
    this.onChange(this.strokes);
  }

  clear() {
    this.strokes = [];
    this.active = null;
    this.repaint();
    this.onChange(this.strokes);
  }

  get empty() {
    return !this.strokes.some((stroke) => stroke.length >= 2);
  }

  repaint() {
    const { context, canvas } = this;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    context.clearRect(0, 0, width, height);

    // A horizon line to draw against; it also tells the player which way is
    // up, which is the one thing the band reader cares about.
    context.strokeStyle = 'rgba(255,255,255,0.12)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, height - 12);
    context.lineTo(width, height - 12);
    context.stroke();

    context.strokeStyle = this.colour;
    context.lineWidth = STROKE_WIDTH;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const stroke of this.strokes) {
      if (stroke.length < 2) continue;
      context.beginPath();
      context.moveTo(stroke[0].x, stroke[0].y);
      for (const point of stroke.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
    }
  }
}

// Draws a spec's band profile into a small canvas, so the sketchbook in the
// HUD shows the shape the game understood rather than a generic icon.
export function thumbnail(spec, size = 44, colour = '#f4f0ff') {
  const canvas = document.createElement('canvas');
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * ratio;
  canvas.height = size * ratio;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = colour;

  const top = spec.bands[spec.bands.length - 1].y1 || 1;
  const pad = 3;
  const usable = size - pad * 2;
  for (const band of spec.bands) {
    const w = Math.max(1, band.halfWidth * 2 * usable);
    const h = Math.max(1, ((band.y1 - band.y0) / top) * usable);
    context.fillRect(
      pad + (band.offset * usable - w / 2),
      pad + usable - (band.y1 / top) * usable,
      w,
      h + 0.5,
    );
  }
  return canvas;
}
