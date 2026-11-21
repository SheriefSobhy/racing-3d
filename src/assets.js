import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const BASE = import.meta.env.BASE_URL + 'assets/';

// Approximate sizes (KB) so the progress bar moves in proportion to bytes.
const FILES = {
  car: ['cars/car.glb', 1180],
  barrier: ['models/barrier.glb', 95],
  lamp: ['models/lamp.glb', 70],
  sky: ['sky/sky.webp', 50],
  skyInfo: ['sky/sky.json', 1],
  road: ['tex/road.webp', 135],
  grass: ['tex/grass.webp', 255],
  concrete: ['tex/concrete.webp', 27],
  trees: ['tex/trees.webp', 250],
  facade0: ['tex/facade0.webp', 9],
  facade1: ['tex/facade1.webp', 24],
  facade2: ['tex/facade2.webp', 15],
  facade3: ['tex/facade3.webp', 30],
};
// Only needed for High graphics.
const HIGH_FILES = {
  env: ['sky/env.hdr', 520],
  roadN: ['tex/asphalt_n.webp', 52],
  grassN: ['tex/grass_n.webp', 99],
  concreteN: ['tex/concrete_n.webp', 16],
};

const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const texLoader = new THREE.TextureLoader();

function loadOne(key, path, onBytes) {
  const url = BASE + path;
  if (path.endsWith('.glb')) {
    return gltfLoader.loadAsync(url, (e) => e.lengthComputable && onBytes(key, e.loaded / e.total));
  }
  if (path.endsWith('.json')) return fetch(url).then((r) => r.json());
  if (path.endsWith('.hdr')) return new RGBELoader().loadAsync(url);
  return texLoader.loadAsync(url);
}

async function loadSet(files, onProgress) {
  const total = Object.values(files).reduce((a, [, kb]) => a + kb, 0);
  const frac = {};
  const report = () => {
    let done = 0;
    for (const [k, [, kb]] of Object.entries(files)) done += (frac[k] || 0) * kb;
    onProgress(Math.min(1, done / total));
  };
  const onBytes = (k, f) => {
    frac[k] = Math.min(0.95, f);
    report();
  };
  const out = {};
  await Promise.all(
    Object.entries(files).map(async ([key, [path]]) => {
      out[key] = await loadOne(key, path, onBytes);
      frac[key] = 1;
      report();
    }),
  );
  return out;
}

function prepTexture(t, { srgb = true, repeat = true, aniso = 1 } = {}) {
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/** Core assets used by both graphics levels. */
export async function loadAssets(renderer, onProgress) {
  const a = await loadSet(FILES, onProgress);
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  for (const k of ['road', 'grass', 'concrete', 'facade0', 'facade1', 'facade2', 'facade3']) prepTexture(a[k], { aniso });
  prepTexture(a.trees, { repeat: false });
  a.sky.colorSpace = THREE.SRGBColorSpace;
  a.sky.mapping = THREE.EquirectangularReflectionMapping;
  a.aniso = aniso;
  return a;
}

/** Extra assets for High graphics: HDR environment (reflections) and normal maps. */
export async function loadHighAssets(renderer, onProgress = () => {}) {
  const h = await loadSet(HIGH_FILES, onProgress);
  for (const k of ['roadN', 'grassN', 'concreteN']) prepTexture(h[k], { srgb: false, aniso: Math.min(4, renderer.capabilities.getMaxAnisotropy()) });
  const pmrem = new THREE.PMREMGenerator(renderer);
  h.envMap = pmrem.fromEquirectangular(h.env).texture;
  h.env.dispose();
  pmrem.dispose();
  return h;
}
