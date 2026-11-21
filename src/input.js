const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  nitro: ['Space', 'ArrowUp', 'KeyW'],
  drift: ['ShiftLeft', 'ShiftRight', 'ArrowDown', 'KeyS'],
};
const PREVENT = new Set(Object.values(KEYS).flat());

/** Keyboard, on-screen buttons and device tilt. */
export class Input {
  constructor() {
    this.keys = new Set();
    this.btn = { left: false, right: false, nitro: false, drift: false };
    this.buttons = {};
    this.tiltMode = false;
    this.hasTilt = false;
    this.tilt = 0;
    this.onKey = null;
    // iOS reports gravity with the opposite sign to Android.
    this.tiltSign =
      typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function' ? 1 : -1;

    addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!e.repeat && this.onKey) this.onKey(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.releaseAll());
    addEventListener('devicemotion', (e) => this.onMotion(e));
  }

  releaseAll() {
    this.keys.clear();
    for (const k in this.btn) this.btn[k] = false;
    for (const el of Object.values(this.buttons)) el.classList.remove('active');
  }

  bindButton(el, name) {
    this.buttons[name] = el;
    const set = (v) => {
      this.btn[name] = v;
      el.classList.toggle('active', v);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* not supported */
      }
      set(true);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => set(false));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onMotion(e) {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null || g.y == null) return;
    this.hasTilt = true;
    const deg =
      screen.orientation && typeof screen.orientation.angle === 'number'
        ? screen.orientation.angle
        : Number(window.orientation) || 0;
    const ang = (deg * Math.PI) / 180;
    // Gravity component along the screen's horizontal axis -> steering-wheel style tilt.
    const sx = g.x * Math.cos(ang) - g.y * Math.sin(ang);
    const raw = Math.max(-1, Math.min(1, (this.tiltSign * sx) / (9.81 * 0.42)));
    this.tilt += (raw - this.tilt) * 0.35;
  }

  async enableTilt() {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        return (await DeviceMotionEvent.requestPermission()) === 'granted';
      }
      return typeof DeviceMotionEvent !== 'undefined';
    } catch {
      return false;
    }
  }

  has(list) {
    for (const k of list) if (this.keys.has(k)) return true;
    return false;
  }

  steer() {
    let s = 0;
    if (this.btn.left || this.has(KEYS.left)) s -= 1;
    if (this.btn.right || this.has(KEYS.right)) s += 1;
    if (s === 0 && this.tiltMode && this.hasTilt) {
      const t = this.tilt;
      s = Math.abs(t) < 0.06 ? 0 : (t - Math.sign(t) * 0.06) / 0.94;
    }
    return s;
  }

  nitro() {
    return this.btn.nitro || this.has(KEYS.nitro);
  }

  drift() {
    return this.btn.drift || this.has(KEYS.drift);
  }
}
