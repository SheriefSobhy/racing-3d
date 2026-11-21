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
