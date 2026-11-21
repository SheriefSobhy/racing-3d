// Procedural, endless highway centre line.
// The road is described by distance `s` along it; heading and height are
// smooth sums of sines, and x/z positions are integrated into a lookup table.

export const DS = 2; // table resolution in metres
export const LANES = [-6, -2, 2, 6];
export const ROAD_HALF = 10;

const xs = [0];
const zs = [0];

const H0 = 0.3 * Math.sin(1.2);
export function heading(s) {
  return 0.55 * Math.sin(s / 520) + 0.3 * Math.sin(s / 200 + 1.2) - H0;
}
export function curvature(s) {
  return (0.55 / 520) * Math.cos(s / 520) + (0.3 / 200) * Math.cos(s / 200 + 1.2);
}

const HOFF = 3 * Math.sin(0.7);
export function height(s) {
  return 9 * Math.sin(s / 300) + 3 * Math.sin(s / 115 + 0.7) - HOFF;
}
export function slope(s) {
  return (9 / 300) * Math.cos(s / 300) + (3 / 115) * Math.cos(s / 115 + 0.7);
}

function ensure(s) {
  const need = Math.ceil(s / DS) + 2;
  while (xs.length < need) {
    const i = xs.length - 1;
    const th = heading((i + 0.5) * DS);
    xs.push(xs[i] + Math.sin(th) * DS);
    zs.push(zs[i] - Math.cos(th) * DS);
  }
}

/**
 * Road frame at distance s: position (x,y,z), forward (fx,fz), right (rx,rz),
 * heading th and slope. Forward is -Z when th = 0; right is +X.
 */
export function frame(s, out = {}) {
  if (s < 0) s = 0;
  ensure(s + DS);
  const f = s / DS;
  const i = Math.floor(f);
  const t = f - i;
  out.x = xs[i] + (xs[i + 1] - xs[i]) * t;
  out.z = zs[i] + (zs[i + 1] - zs[i]) * t;
  out.y = height(s);
  const th = heading(s);
  const sn = Math.sin(th);
  const cs = Math.cos(th);
  out.th = th;
  out.fx = sn;
  out.fz = -cs;
  out.rx = cs;
  out.rz = sn;
  out.slope = slope(s);
  out.s = s;
  return out;
}

/** Terrain height beside the road; rises into rolling hills further out. */
export function groundY(s, o) {
  const a = Math.abs(o);
  let y = height(s) - 0.05;
  if (a > 16) {
    const k = Math.min(1, (a - 16) / 140);
    const n = 0.5 + 0.5 * Math.sin(s * 0.011 + o * 0.023) * Math.cos(s * 0.007 - o * 0.017);
    y += k * k * 30 * n;
  }
  return y;
}
