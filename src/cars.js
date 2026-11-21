import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GeoBuilder, T, put, col } from './geo.js';

/** Player cars. Speeds are in m/s (x3.6 for km/h). */
export const CARS = [
  {
    id: 'vortex', name: 'VORTEX GT', price: 0,
    color: 0xd81f2a, accent: 0x1b1b1f, rim: 0xc9ced6,
    maxSpeed: 70, accel: 13, handling: 1.0, nitro: 1.0, wing: 'lip',
  },
  {
    id: 'kestrel', name: 'KESTREL RS', price: 300,
    color: 0x1c7ce0, accent: 0xf2f2f2, rim: 0x2a2d33,
    maxSpeed: 74, accel: 15, handling: 1.12, nitro: 1.05, wing: 'wing',
  },
  {
    id: 'solaris', name: 'SOLARIS X', price: 800,
    color: 0xffb000, accent: 0x141414, rim: 0x141414,
    maxSpeed: 78, accel: 16, handling: 1.05, nitro: 1.3, wing: 'wing',
  },
  {
    id: 'umbra', name: 'UMBRA Z9', price: 1500,
    color: 0x7a2cf0, accent: 0x00e5ff, rim: 0xe6e6e6,
    maxSpeed: 84, accel: 18, handling: 1.25, nitro: 1.3, wing: 'wing',
  },
];

export function makeTextures() {
  const mk = (size, stops) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, s] of stops) gr.addColorStop(o, s);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return {
    glow: mk(64, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.65)'], [1, 'rgba(255,255,255,0)']]),
    shadow: mk(64, [[0, 'rgba(0,0,0,0.85)'], [0.55, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]),
    smoke: mk(64, [[0, 'rgba(255,255,255,0.9)'], [0.5, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]),
  };
}

const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
let shadowMat = null;
export function shadowMesh(tex, w, l) {
  if (!shadowMat) {
    shadowMat = new THREE.MeshBasicMaterial({ map: tex.shadow, transparent: true, depthWrite: false, opacity: 0.75 });
  }
  const m = new THREE.Mesh(shadowGeo, shadowMat);
  m.scale.set(w, 1, l);
  m.position.y = 0.04;
  m.renderOrder = 1;
  return m;
}

function extrudeProfile(pts, depth, bevel) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1,
  });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2); // profile x (front) -> -Z, extrusion -> X (width)
  return g;
}

/**
 * Low-poly sports car. Front faces -Z. Returns handles used for animation.
 */
export function buildPlayerCar(spec, tex) {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();
  root.add(body);

  const mats = {
    paint: new THREE.MeshPhongMaterial({ color: spec.color, shininess: 90, specular: 0x777777, flatShading: true }),
    accent: new THREE.MeshPhongMaterial({ color: spec.accent, shininess: 60, specular: 0x444444, flatShading: true }),
    dark: new THREE.MeshLambertMaterial({ color: 0x15171c }),
    glass: new THREE.MeshPhongMaterial({ color: 0x0c1522, shininess: 140, specular: 0xaabbcc, flatShading: true }),
    tail: new THREE.MeshBasicMaterial({ color: 0xff2236 }),
    head: new THREE.MeshBasicMaterial({ color: 0xfff6dc }),
  };
  const parts = new Map();
  const add = (mat, geo, x = 0, y = 0, z = 0) => {
    let g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('uv');
    g.translate(x, y, z);
    if (!parts.has(mat)) parts.set(mat, []);
    parts.get(mat).push(g);
  };
  const box = (sx, sy, sz) => new THREE.BoxGeometry(sx, sy, sz);

  // Main body and cabin from side profiles (x = forward, y = up)
  add(mats.paint, extrudeProfile(
    [[-2.25, 0.3], [2.1, 0.3], [2.28, 0.42], [2.2, 0.58], [1.3, 0.72], [0.6, 0.8], [-1.6, 0.86], [-2.2, 0.86], [-2.3, 0.62], [-2.28, 0.36]],
    1.82, 0.06,
  ));
  add(mats.glass, extrudeProfile([[0.75, 0.76], [-0.05, 1.13], [-0.95, 1.15], [-1.75, 0.82]], 1.46, 0.04));
  add(mats.paint, box(1.36, 0.05, 0.86), 0, 1.19, 0.5);

  if (spec.wing === 'wing') {
    add(mats.accent, box(0.08, 0.26, 0.14), -0.55, 1.0, 1.95);
    add(mats.accent, box(0.08, 0.26, 0.14), 0.55, 1.0, 1.95);
    add(mats.accent, box(1.86, 0.05, 0.42), 0, 1.14, 2.0);
    add(mats.accent, box(0.04, 0.22, 0.46), -0.93, 1.1, 2.0);
    add(mats.accent, box(0.04, 0.22, 0.46), 0.93, 1.1, 2.0);
  } else {
    add(mats.accent, box(1.7, 0.05, 0.3), 0, 0.94, 2.1);
  }
  add(mats.accent, box(0.08, 0.1, 2.6), -0.99, 0.33, 0);
  add(mats.accent, box(0.08, 0.1, 2.6), 0.99, 0.33, 0);
  add(mats.accent, box(0.12, 0.08, 0.2), -1.0, 0.92, -0.55); // mirrors
  add(mats.accent, box(0.12, 0.08, 0.2), 1.0, 0.92, -0.55);
  add(mats.dark, box(1.9, 0.05, 0.36), 0, 0.26, -2.2);
  add(mats.dark, box(1.7, 0.16, 0.25), 0, 0.34, 2.27);
  add(mats.dark, box(1.0, 0.1, 0.06), 0, 0.42, -2.33); // grille
  for (const x of [-0.42, 0.42]) {
    add(mats.dark, new THREE.CylinderGeometry(0.065, 0.065, 0.2, 8).rotateX(Math.PI / 2), x, 0.36, 2.34);
  }
  for (const x of [-0.62, 0.62]) {
    add(mats.head, box(0.46, 0.08, 0.1), x, 0.56, -2.23);
    add(mats.tail, box(0.5, 0.1, 0.05), x, 0.72, 2.33);
  }
  add(mats.tail, box(0.7, 0.04, 0.04), 0, 0.72, 2.33);

  for (const [mat, geos] of parts) {
    body.add(new THREE.Mesh(mergeGeometries(geos), mat));
  }

  // Tail-light glow
  const glowMat = new THREE.SpriteMaterial({
    map: tex.glow, color: 0xff2a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const glows = [];
  for (const x of [-0.62, 0.62]) {
    const sp = new THREE.Sprite(glowMat);
    sp.position.set(x, 0.72, 2.45);
    sp.scale.set(1.0, 0.5, 1);
    body.add(sp);
    glows.push(sp);
  }

  // Nitro flames (tip points backwards, +Z)
  const flames = new THREE.Group();
  const flameGeo = (r, l) => new THREE.ConeGeometry(r, l, 8, 1, true).translate(0, l / 2, 0).rotateX(Math.PI / 2);
  const outer = [], inner = [];
  for (const x of [-0.42, 0.42]) {
    outer.push(flameGeo(0.14, 1.1).translate(x, 0.36, 2.42));
    inner.push(flameGeo(0.07, 0.6).translate(x, 0.36, 2.42));
  }
  const flameMat = (c, o) => new THREE.MeshBasicMaterial({
    color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  flames.add(new THREE.Mesh(mergeGeometries(outer), flameMat(0x3a9cff, 0.85)));
  flames.add(new THREE.Mesh(mergeGeometries(inner), flameMat(0xe0f6ff, 0.95)));
  flames.visible = false;
  body.add(flames);

  // Wheels: one vertex-coloured mesh each, spokes make the spin visible.
  const wb = new GeoBuilder();
  const tire = col(0x17181b), rim = col(spec.rim), spoke = col(0x3c4047), hub = col(0xd02030);
  put(wb, T.wheel, 0, 0, 0, 0.3, 0.34, 0.34, tire);
  put(wb, T.wheel, 0, 0, 0, 0.32, 0.23, 0.23, rim);
  put(wb, T.box, 0, 0, 0, 0.335, 0.42, 0.07, spoke);
  put(wb, T.box, 0, 0, 0, 0.335, 0.07, 0.42, spoke);
  put(wb, T.wheel, 0, 0, 0, 0.345, 0.06, 0.06, hub);
  const wheelGeo = wb.build();
  const wheelMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 50, flatShading: true });
  const steers = [];
  const spins = [];
  for (const [x, z, front] of [[-0.9, -1.4, true], [0.9, -1.4, true], [-0.9, 1.35, false], [0.9, 1.35, false]]) {
    const steer = new THREE.Group();
    steer.position.set(x, 0.34, z);
    const spin = new THREE.Mesh(wheelGeo, wheelMat);
    steer.add(spin);
    root.add(steer);
    spins.push(spin);
    if (front) steers.push(steer);
  }

  root.add(shadowMesh(tex, 2.6, 5.4));

  return { root, body, steers, spins, flames, glows, glowMat, spec };
}

/** Simple traffic vehicles: body (tinted per car), details and lights. */
export function buildTrafficTemplates() {
  const K = {
    glass: col(0x1a2533), tire: col(0x18191c), bumper: col(0x2a2c30), tail: col(0xff2030),
    head: col(0xfff3d0), trailer: col(0xe4e6e8), chassis: col(0x303236), amber: col(0xffa21f),
  };
  const W = col(0xffffff);
  const bx = (gb, x, y, z, sx, sy, sz, c) => put(gb, T.box, x, y, z, sx, sy, sz, c);
  const wh = (gb, x, z, r, w) => put(gb, T.wheel, x, r, z, w, r, r, K.tire);
  const make = (type, length, width, weight, fn) => {
    const b = new GeoBuilder(), d = new GeoBuilder(), l = new GeoBuilder();
    fn(b, d, l);
    return { type, length, width, weight, body: b.build(), det: d.build(), lit: l.build() };
  };
  const lights = (l, x, yT, yH, zr, zf, sx = 0.44, sy = 0.13) => {
    for (const s of [-1, 1]) {
      bx(l, s * x, yT, zr, sx, sy, 0.05, K.tail);
      bx(l, s * x, yH, zf, 0.4, 0.1, 0.05, K.head);
    }
  };

  return [
    make('sedan', 4.4, 1.84, 0.45, (b, d, l) => {
      bx(b, 0, 0.58, 0, 1.84, 0.6, 4.4, W);
      bx(d, 0, 1.12, 0.25, 1.62, 0.5, 2.2, K.glass);
      bx(b, 0, 1.39, 0.3, 1.64, 0.06, 1.8, W);
      bx(d, 0, 0.33, -2.18, 1.88, 0.16, 0.14, K.bumper);
      bx(d, 0, 0.33, 2.18, 1.88, 0.16, 0.14, K.bumper);
      for (const x of [-0.84, 0.84]) for (const z of [-1.35, 1.35]) wh(d, x, z, 0.33, 0.26);
      lights(l, 0.6, 0.74, 0.66, 2.21, -2.21);
    }),
    make('suv', 4.7, 1.96, 0.25, (b, d, l) => {
      bx(b, 0, 0.76, 0, 1.96, 0.82, 4.7, W);
      bx(d, 0, 1.47, 0.25, 1.78, 0.62, 2.7, K.glass);
      bx(b, 0, 1.8, 0.3, 1.8, 0.07, 2.5, W);
      bx(d, 0, 0.42, -2.34, 2.0, 0.2, 0.14, K.bumper);
      bx(d, 0, 0.42, 2.34, 2.0, 0.2, 0.14, K.bumper);
      for (const x of [-0.9, 0.9]) for (const z of [-1.5, 1.5]) wh(d, x, z, 0.38, 0.28);
      lights(l, 0.66, 0.98, 0.86, 2.36, -2.36);
    }),
    make('van', 5.2, 2.0, 0.18, (b, d, l) => {
      bx(b, 0, 1.3, 0, 2.0, 1.95, 5.2, W);
      bx(d, 0, 1.75, -2.6, 1.8, 0.72, 0.05, K.glass);
      bx(d, 0, 1.8, -1.75, 2.03, 0.55, 1.1, K.glass);
      bx(d, 0, 0.38, -2.6, 2.04, 0.2, 0.14, K.bumper);
      bx(d, 0, 0.38, 2.6, 2.04, 0.2, 0.14, K.bumper);
      for (const x of [-0.92, 0.92]) for (const z of [-1.75, 1.75]) wh(d, x, z, 0.36, 0.28);
      for (const s of [-1, 1]) {
        bx(l, s * 0.85, 1.0, 2.61, 0.22, 0.55, 0.05, K.tail);
        bx(l, s * 0.7, 0.8, -2.61, 0.4, 0.12, 0.05, K.head);
      }
    }),
    make('truck', 10.3, 2.45, 0.12, (b, d, l) => {
      bx(b, 0, 1.6, -4.0, 2.4, 2.3, 2.4, W);
      bx(d, 0, 2.15, -5.21, 2.2, 0.85, 0.05, K.glass);
      bx(d, 0, 2.05, 1.3, 2.5, 3.0, 7.6, K.trailer);
      bx(d, 0, 0.6, 0, 2.2, 0.3, 10.2, K.chassis);
      bx(d, 0, 0.55, 5.12, 2.4, 0.2, 0.1, K.bumper);
      bx(d, 0, 0.5, -5.2, 2.44, 0.25, 0.12, K.bumper);
      for (const x of [-1.0, 1.0]) for (const z of [-4.0, 2.6, 3.9]) wh(d, x, z, 0.5, 0.34);
      for (const s of [-1, 1]) {
        bx(l, s * 1.0, 0.85, 5.18, 0.32, 0.2, 0.04, K.tail);
        bx(l, s * 0.8, 1.0, -5.22, 0.4, 0.14, 0.04, K.head);
        bx(l, s * 1.2, 3.5, 5.11, 0.1, 0.1, 0.05, K.amber);
      }
    }),
  ];
}
