// Preview player: draws frames of a Video onto the stage canvas, plays in
// real time (dropping frames when the device is slow) and seeks.

export class Player {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.video = null;
    this.fmt = 'landscape';
    this.g = 0;
    this.playing = false;
    this.listeners = new Set();
    this.raf = 0;
    this.scale = 1;
    this.error = null;
    this.loop = false;
  }

  on(fn) {
    this.listeners.add(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }

  get total() {
    try {
      return this.video ? this.video.totalFrames(this.fmt) : 0;
    } catch {
      return 0;
    }
  }

  get fps() {
    return this.video?.fps ?? 30;
  }

  setVideo(video, fmt = this.fmt) {
    this.video = video;
    this.fmt = fmt;
    this.error = null;
    try {
      video.prepare(fmt);
    } catch (e) {
      this.error = e;
    }
    this.resize();
    this.g = Math.min(this.g, Math.max(0, this.total - 1));
    this.draw();
    this.emit();
  }

  setFormat(fmt) {
    if (fmt === this.fmt || !this.video) return;
    const frac = this.total ? this.g / this.total : 0;
    this.fmt = fmt;
    this.setVideo(this.video, fmt);
    this.seek(Math.round(frac * this.total));
  }

  /** Match the canvas resolution to its displayed size (capped at full HD). */
  resize() {
    if (!this.video) return;
    const { L } = this.video.prepare(this.fmt);
    const box = this.canvas.parentElement?.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Fit the frame inside the stage, leaving a small margin.
    const fit = box && box.width > 0 && box.height > 0 ? Math.min((box.width - 16) / L.W, (box.height - 16) / L.H) : 0.5;
    const shown = Math.max(0.05, fit);
    this.canvas.style.width = `${Math.floor(L.W * shown)}px`;
    this.canvas.style.height = `${Math.floor(L.H * shown)}px`;
    const scale = Math.min(1, Math.max(0.25, shown * dpr));
    // Round to steps so tiny layout changes don't reallocate the canvas.
    this.scale = Math.ceil(scale * 8) / 8;
    const w = Math.round(L.W * this.scale);
    const h = Math.round(L.H * this.scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  draw() {
    if (!this.video || this.error) return;
    try {
      this.video.drawFrame(this.ctx, this.fmt, this.g, this.scale);
    } catch (e) {
      this.error = e;
      this.pause();
      this.emit();
    }
  }

  seek(g) {
    const total = this.total;
    this.g = Math.max(0, Math.min(total - 1, Math.round(g)));
    this.draw();
    this.emit();
  }

  play() {
    if (this.playing || !this.video || this.error) return;
    if (this.g >= this.total - 1) this.g = 0;
    this.playing = true;
    const startG = this.g;
    this.onPlayState?.(true, startG / this.fps);
    const t0 = performance.now();
    const tick = (now) => {
      if (!this.playing) return;
      const g = startG + Math.floor(((now - t0) / 1000) * this.fps);
      if (g >= this.total) {
        if (this.loop) {
          this.playing = false;
          this.onPlayState?.(false);
          this.g = 0;
          this.play();
          return;
        }
        this.g = this.total - 1;
        this.draw();
        this.pause();
        return;
      }
      if (g !== this.g) {
        this.g = g;
        this.draw();
        this.emit();
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.emit();
  }

  pause() {
    const was = this.playing;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    if (was) this.onPlayState?.(false);
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }
}
