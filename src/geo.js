import * as THREE from 'three';

/**
 * Accumulates flat-shaded, vertex-coloured triangles into one BufferGeometry.
 * Used to merge scenery and simple vehicles so each draws in a single call.
 */
export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.col = [];
  }

  /** Append a non-indexed template geometry transformed by a Matrix4. */
  add(geo, m, c) {
    const p = geo.attributes.position.array;
    const e = m.elements;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      this.pos.push(
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14],
      );
      this.col.push(c.r, c.g, c.b);
    }
  }

  tri(a, b, c, ca, cb = ca, cc = ca) {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  }

  /** a,b,c,d counter-clockwise when seen from the visible side. */
  quad(a, b, c, d, color) {
    this.tri(a, b, d, color);
    this.tri(b, c, d, color);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// Shared low-poly templates (non-indexed).
export const T = {
  box: new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), // centred
  boxB: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0).toNonIndexed(), // base at y=0
  cyl: new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0).toNonIndexed(),
  cone: new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0).toNonIndexed(),
  ico: new THREE.IcosahedronGeometry(1, 0),
  wheel: new THREE.CylinderGeometry(1, 1, 1, 12).rotateZ(Math.PI / 2).toNonIndexed(),
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

export function put(gb, geo, x, y, z, sx, sy, sz, color, yaw = 0) {
  _q.setFromEuler(_e.set(0, yaw, 0));
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  gb.add(geo, _m, color);
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const col = (hex) => new THREE.Color(hex);

export function jitter(c, r, amt = 0.08) {
  const k = 1 + (r - 0.5) * 2 * amt;
  return new THREE.Color(c.r * k, c.g * k, c.b * k);
}
