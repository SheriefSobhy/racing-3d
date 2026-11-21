const KEY = 'highwayBlitz.save.v1';

const defaults = () => ({ best: 0, coins: 0, owned: ['vortex'], selected: 'vortex', steering: 'buttons' });

export function loadSave() {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw);
    return {
      best: Number(s.best) || 0,
      coins: Number(s.coins) || 0,
      owned: Array.isArray(s.owned) && s.owned.length ? s.owned : d.owned,
      selected: typeof s.selected === 'string' ? s.selected : d.selected,
      steering: s.steering === 'tilt' ? 'tilt' : 'buttons',
    };
  } catch {
    return d;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode) */
  }
}

// ---------- Camera / display settings ----------
const SETTINGS_KEY = 'highwayBlitz.settings.v1';
const VIEW_IDS = ['chase', 'far', 'hood', 'bumper'];

/** Slider ranges: [min, max, step]. */
export const SETTING_RANGES = {
  fov: [60, 90, 1],
  dist: [4, 12, 0.5],
  height: [1.5, 5, 0.1],
  follow: [1, 12, 0.5],
  sfx: [0, 100, 1],
  music: [0, 100, 1],
};

export const settingsDefaults = () => ({
  view: 'chase', fov: 62, dist: 7, height: 2.7, follow: 6, shake: true, speedFx: true, gfx: 'high', gfxChosen: false, sfx: 80, music: 60, muted: false,
});

const clampSetting = (key, v, d) => {
  const [lo, hi] = SETTING_RANGES[key];
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function loadSettings() {
  const d = settingsDefaults();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return d;
    const s = JSON.parse(raw);
    return {
      view: VIEW_IDS.includes(s.view) ? s.view : d.view,
      fov: clampSetting('fov', s.fov, d.fov),
      dist: clampSetting('dist', s.dist, d.dist),
      height: clampSetting('height', s.height, d.height),
      follow: clampSetting('follow', s.follow, d.follow),
      shake: typeof s.shake === 'boolean' ? s.shake : d.shake,
      speedFx: typeof s.speedFx === 'boolean' ? s.speedFx : d.speedFx,
      gfx: s.gfx === 'low' || s.gfx === 'high' ? s.gfx : d.gfx,
      gfxChosen: s.gfxChosen === true,
      sfx: clampSetting('sfx', s.sfx ?? d.sfx, d.sfx),
      music: clampSetting('music', s.music ?? d.music, d.music),
      muted: s.muted === true,
    };
  } catch {
    return d;
  }
}

export function writeSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode) */
  }
}
