// Asset pipeline for sky, textures, trees and roadside models (run once; output is committed).
//   npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   node tools/build-world.mjs <raw-dir> public/assets
// <raw-dir> holds the original downloads (see CREDITS.md for sources):
//   ph/kloofendal_48d_partly_cloudy_puresky_1k.hdr, ph/sky_tonemapped.jpg
//   tex/{asphalt_02,leafy_grass,brushed_concrete,pine_bark}_{diff,nor}.jpg
//   acg/Facade00X/..._Color.jpg, acg/LeafSet019, acg/LeafSet024
//   models/concrete_road_barrier_02, models/street_lamp_01 (Poly Haven 1k glTF)
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, textureCompress, meshopt, flatten, join as joinMeshes } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [RAW, OUT] = process.argv.slice(2);
const P = (...a) => join(RAW, ...a);
for (const d of ['sky', 'tex', 'models']) mkdirSync(join(OUT, d), { recursive: true });
const webp = (img, file, q = 80) => img.webp({ quality: q, effort: 6 }).toFile(join(OUT, file));

// ---------- Random ----------
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

// ---------- HDR (Radiance RGBE) ----------
function readHDR(buf) {
  let pos = 0;
  const line = () => {
    let s = '';
    while (buf[pos] !== 10) s += String.fromCharCode(buf[pos++]);
    pos++;
    return s;
  };
  let l;
  while ((l = line()) !== '');
  const [, h, , w] = line().split(' ').map((v, i) => (i % 2 ? +v : v));
  const data = new Float32Array(w * h * 3);
  const scan = new Uint8Array(w * 4);
  for (let y = 0; y < h; y++) {
    if (buf[pos] === 2 && buf[pos + 1] === 2) {
      pos += 4;
      for (let c = 0; c < 4; c++) {
        let x = 0;
        while (x < w) {
          let n = buf[pos++];
          if (n > 128) {
            n -= 128;
            const v = buf[pos++];
            while (n--) scan[(x++) * 4 + c] = v;
          } else while (n--) scan[(x++) * 4 + c] = buf[pos++];
        }
      }
    } else {
      for (let x = 0; x < w * 4; x++) scan[x] = buf[pos++];
    }
    for (let x = 0; x < w; x++) {
      const e = scan[x * 4 + 3];
      const f = e ? Math.pow(2, e - 136) : 0;
      for (let c = 0; c < 3; c++) data[(y * w + x) * 3 + c] = scan[x * 4 + c] * f;
    }
  }
  return { w, h, data };
}
function writeHDR(file, { w, h, data }) {
  const head = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`);
  const body = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const m = Math.max(r, g, b);
    if (m < 1e-32) continue;
    const e = Math.ceil(Math.log2(m) + 1e-9);
    const sc = 256 / Math.pow(2, e);
    body[i * 4] = Math.min(255, r * sc);
    body[i * 4 + 1] = Math.min(255, g * sc);
    body[i * 4 + 2] = Math.min(255, b * sc);
    body[i * 4 + 3] = e + 128;
  }
  writeFileSync(file, Buffer.concat([head, body]));
}

async function sky() {
  const hdr = readHDR(readFileSync(P('ph', 'kloofendal_48d_partly_cloudy_puresky_1k.hdr')));
  // Sun direction = brightest pixel. Equirect: u -> longitude, v -> latitude.
  let best = 0, bi = 0;
  for (let i = 0; i < hdr.w * hdr.h; i++) {
    const v = hdr.data[i * 3] + hdr.data[i * 3 + 1] + hdr.data[i * 3 + 2];
    if (v > best) { best = v; bi = i; }
  }
  const u = ((bi % hdr.w) + 0.5) / hdr.w, v = (Math.floor(bi / hdr.w) + 0.5) / hdr.h;
  const phi = (u - 0.5) * 2 * Math.PI, theta = (0.5 - v) * Math.PI; // three.js equirect convention
  const sun = [-Math.sin(phi) * Math.cos(theta), Math.sin(theta), -Math.cos(phi) * Math.cos(theta)];
  // three's equirect lookup: u = atan(dir.z, dir.x) / 2pi + 0.5, v = asin(dir.y)/pi + 0.5 (flipY)
  const az = (u - 0.5) * 2 * Math.PI;
  const sunDir = [Math.cos(az) * Math.cos(theta), Math.sin(theta), Math.sin(az) * Math.cos(theta)];
  // Horizon colour = average just above the horizon (tonemapped image).
  const half = { w: 512, h: 256, data: new Float32Array(512 * 256 * 3) };
  for (let y = 0; y < 256; y++) for (let x = 0; x < 512; x++) for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s += hdr.data[((y * 2 + dy) * hdr.w + x * 2 + dx) * 3 + c];
    half.data[(y * 512 + x) * 3 + c] = s / 4;
  }
  writeHDR(join(OUT, 'sky', 'env.hdr'), half);

  const ldr = sharp(P('ph', 'sky_tonemapped.jpg')).resize(2048, 1024);
  await webp(ldr.clone(), 'sky/sky.webp', 78);
  const { data, info } = await sharp(P('ph', 'sky_tonemapped.jpg')).resize(256, 128).raw().toBuffer({ resolveWithObject: true });
  const avg = (y0, y1) => {
    const c = [0, 0, 0];
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < info.width; x++) {
      for (let k = 0; k < 3; k++) c[k] += data[(y * info.width + x) * info.channels + k];
      n++;
    }
    return c.map((v) => Math.round(v / n));
  };
  const horizon = avg(60, 63);
  writeFileSync(join(OUT, 'sky', 'sky.json'), JSON.stringify({ sunDir, sunTheta: theta, horizon, unused: sun.length }, null, 0));
  console.log('sky: sun', sunDir.map((v) => v.toFixed(2)), 'horizon', horizon);
}

// ---------- Ground textures ----------
async function textures() {
  await webp(sharp(P('tex', 'leafy_grass_diff.jpg')).resize(1024).modulate({ saturation: 1.15 }), 'tex/grass.webp', 72);
  await webp(sharp(P('tex', 'leafy_grass_nor.jpg')).resize(512), 'tex/grass_n.webp', 80);
  await webp(sharp(P('tex', 'brushed_concrete_diff.jpg')).resize(512), 'tex/concrete.webp', 75);
  await webp(sharp(P('tex', 'brushed_concrete_nor.jpg')).resize(512), 'tex/concrete_n.webp', 80);
  await webp(sharp(P('tex', 'asphalt_02_nor.jpg')).resize(512), 'tex/asphalt_n.webp', 80);

  // Road: 20 m wide x 24 m long in a 1024 x 1024 image with painted lane markings.
  // Columns map lateral offset -10..10 m, rows map 24 m of road (two dash cycles).
  const S = 1024, mpx = 20 / S, mpy = 24 / S;
  const tile = await sharp(P('tex', 'asphalt_02_diff.jpg')).resize(Math.round(S / 3), Math.round(S / 3)).modulate({ brightness: 0.78 }).toBuffer();
  const comps = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) comps.push({ input: tile, left: Math.round((x * S) / 3), top: Math.round((y * S) / 3) });
  const base = await sharp({ create: { width: S, height: S, channels: 3, background: '#333' } }).composite(comps).png().toBuffer();
  const px = (m) => Math.round((m + 10) / mpx);
  const rect = (x0, x1, y0, y1, color) => `<rect x="${px(x0)}" y="${Math.round(y0 / mpy)}" width="${px(x1) - px(x0)}" height="${Math.round((y1 - y0) / mpy)}" fill="${color}"/>`;
  let svg = '';
  svg += rect(-8.25, -8.05, 0, 24, '#e9b928'); // yellow edge
  svg += rect(8.05, 8.25, 0, 24, '#ecebe6'); // white edge
  for (const o of [-4, 0, 4]) for (const y of [0, 12]) svg += rect(o - 0.08, o + 0.08, y, y + 4, '#ecebe6');
  // curbs: alternating red / white every 2 m
  for (let y = 0; y < 24; y += 2) {
    const c = (y / 2) % 2 ? '#e8e6e0' : '#c2302f';
    svg += rect(-10, -9.45, y, y + 2, c) + rect(9.45, 10, y, y + 2, c);
  }
  const paint = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><g opacity="0.92">${svg}</g></svg>`);
  // Wear: multiply paint with asphalt detail so it looks worn into the surface.
  const wear = await sharp(base).greyscale().linear(1.6, 40).toColourspace('srgb').toBuffer();
  const painted = await sharp(base).composite([{ input: paint }]).toBuffer();
  const worn = await sharp(painted).composite([{ input: wear, blend: 'multiply' }]).toBuffer();
  const mixed = await sharp(painted).composite([{ input: await sharp(worn).ensureAlpha(0.35).toBuffer(), blend: 'over' }]).toBuffer();
  await webp(sharp(mixed), 'tex/road.webp', 74);

  // Building facades (ambientCG, 1K colour maps -> 512).
  for (const [i, id] of ['Facade006', 'Facade018A', 'Facade005', 'Facade020A'].entries()) {
    const dir = P('acg', id);
    const f = readdirSync(dir).find((n) => n.endsWith('_Color.jpg'));
    await webp(sharp(join(dir, f)).resize(512, 512), `tex/facade${i}.webp`, 72);
  }
}

// ---------- Trees: billboard images composed from CC0 leaf / branch atlases ----------
async function sprites(id, cols, rows) {
  const dir = P('acg', id);
  const color = readdirSync(dir).find((n) => n.endsWith('_Color.png'));
  const op = readdirSync(dir).find((n) => n.endsWith('_Opacity.png'));
  const meta = await sharp(join(dir, color)).metadata();
  const alpha = await sharp(join(dir, op)).removeAlpha().extractChannel(0).raw().toBuffer();
  const rgb = await sharp(join(dir, color)).removeAlpha().raw().toBuffer();
  const px = meta.width * meta.height;
  const buf = Buffer.alloc(px * 4);
  for (let i = 0; i < px; i++) {
    buf[i * 4] = rgb[i * 3];
    buf[i * 4 + 1] = rgb[i * 3 + 1];
    buf[i * 4 + 2] = rgb[i * 3 + 2];
    buf[i * 4 + 3] = alpha[i];
  }
  const rgba = await sharp(buf, { raw: { width: meta.width, height: meta.height, channels: 4 } }).png().toBuffer();
  const out = [];
  const cw = Math.floor(meta.width / cols), ch = Math.floor(meta.height / rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    try {
      const cell = await sharp(rgba).extract({ left: c * cw, top: r * ch, width: cw, height: ch }).png().toBuffer();
      const t = await sharp(cell).trim({ threshold: 10 }).png().toBuffer();
      const m = await sharp(t).metadata();
      if (m.width > 20 && m.height > 20) out.push(t);
    } catch { /* empty cell */ }
  }
  return out;
}

async function place(spr, size, rot, bright, flop = false) {
  let img = sharp(spr).resize(Math.round(size), Math.round(size), { fit: "inside" });
  if (flop) img = img.flop();
  img = img.rotate(rot, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).modulate({ brightness: bright });
  return img.png().toBuffer({ resolveWithObject: true });
}

async function trees() {
  let leafyImg, pineImg;
  const bark = await sharp(P('tex', 'pine_bark_diff.jpg')).resize(64, 600, { fit: 'cover' }).modulate({ brightness: 0.7 }).png().toBuffer();

  // Leafy tree crown: 512 x 512 (trunk is real geometry).
  {
    const leaves = await sprites('LeafSet024', 3, 3);
    const W = 512, comps = [];
    // Irregular crown made of leaf clumps (lobes).
    const lobes = [[0, 0, 0.62]];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rnd() * 0.5;
      lobes.push([Math.cos(a) * 0.5, Math.sin(a) * 0.42, 0.3 + rnd() * 0.16]);
    }
    const N = 1500;
    for (let i = 0; i < N; i++) {
      const [lx, ly, lr] = lobes[Math.floor(rnd() * lobes.length)];
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * lr;
      const x = W / 2 + (lx + Math.cos(a) * r) * W * 0.42, y = W / 2 + (ly + Math.sin(a) * r) * W * 0.4;
      const depth = i / N; // later = front = brighter
      const shade = 0.35 + depth * 0.6 - ((y / W) - 0.5) * 0.4 + (rnd() - 0.5) * 0.15;
      const { data, info } = await place(leaves[Math.floor(rnd() * leaves.length)], 15 + rnd() * 11, rnd() * 360, Math.max(0.25, shade), rnd() < 0.5);
      comps.push({ input: data, left: Math.round(Math.max(0, Math.min(W - info.width, x - info.width / 2))), top: Math.round(Math.max(0, Math.min(W - info.height, y - info.height / 2))) });
    }
    const img = await sharp({ create: { width: W, height: W, channels: 4, background: { r: 40, g: 60, b: 30, alpha: 0 } } }).composite(comps).png().toBuffer();
    leafyImg = await sharp(img).modulate({ saturation: 0.9 }).png().toBuffer();
  }

  // Pine: full tree in 512 x 1024 (trunk included).
  {
    const br = await sprites('LeafSet019', 1, 3);
    const W = 512, H = 1024, comps = [];
    comps.push({ input: await sharp(bark).resize(16, 900).png().toBuffer(), left: W / 2 - 8, top: 110 });
    const tiers = 34;
    for (let t = 0; t < tiers; t++) {
      const k = t / (tiers - 1); // 0 = bottom
      const y = H - 120 - k * (H - 170);
      const reach = (1 - k) * 0.46 * W + 34;
      for (let s = 0; s < 6; s++) {
        const side = s % 2 ? 1 : -1;
        const len = reach * (0.7 + rnd() * 0.4);
        const shade = 0.42 + rnd() * 0.25 + (s >= 4 ? 0.25 : 0) + k * 0.15;
        const ang = side * (-12 - rnd() * 18); // droop
        const { data, info } = await place(br[1 + Math.floor(rnd() * (br.length - 1))] || br[0], Math.round(len), side < 0 ? ang + 180 : ang, shade, side < 0);
        const x = side > 0 ? W / 2 - 12 : W / 2 + 12 - info.width;
        comps.push({ input: data, left: Math.round(Math.max(0, Math.min(W - info.width, x))), top: Math.round(Math.max(0, Math.min(H - info.height, y - info.height / 2 + rnd() * 14))) });
      }
    }
    const img = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 30, g: 50, b: 30, alpha: 0 } } }).composite(comps).png().toBuffer();
    pineImg = await sharp(img).modulate({ saturation: 0.85, brightness: 0.95 }).png().toBuffer();
  }

  // One atlas so all trees draw in a single call:
  //   left 512x1024 = pine, right-top 512x512 = leafy crown, right-bottom 512x512 = bark.
  const barkTile = await sharp(P('tex', 'pine_bark_diff.jpg')).resize(512, 512).modulate({ brightness: 0.8 }).png().toBuffer();
  const atlas = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 35, g: 55, b: 30, alpha: 0 } } })
    .composite([
      { input: pineImg, left: 0, top: 0 },
      { input: leafyImg, left: 512, top: 0 },
      { input: barkTile, left: 512, top: 512 },
    ])
    .png()
    .toBuffer();
  await webp(sharp(atlas), 'tex/trees.webp', 72);
}

// ---------- Roadside models ----------
async function models() {
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  for (const [id, ratio, error, out] of [
    ['concrete_road_barrier_02', 0.002, 0.04, 'barrier.glb'],
    ['street_lamp_01', 0.06, 0.004, 'lamp.glb'],
  ]) {
    const doc = await io.read(P('models', id, `${id}_1k.gltf`));
    await doc.transform(
      flatten(), joinMeshes(), dedup(), weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio, error }),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 75 }),
      prune(),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    let t = 0;
    for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) t += p.getIndices().getCount() / 3;
    await io.write(join(OUT, 'models', out), doc);
    console.log(out, 'tris', t);
  }
}

const only = process.argv[4];
if (!only || only === 'sky') await sky();
if (!only || only === 'tex') await textures();
if (!only || only === 'trees') await trees();
if (!only || only === 'models') await models();
