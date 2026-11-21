// Asset pipeline for the player car (run once; output is committed).
//   npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
//   node tools/build-car.mjs <CarConcept.glb> public/assets/cars/car.glb
// Source: Khronos glTF-Sample-Assets "CarConcept" (CC-BY 4.0, Eric Chadwick / DGG,
// based on CC0 "Concept Car 004" by Unity Fan). All Khronos / 3D Commerce logos are removed.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMaterialsVariants } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplifyPrimitive, textureCompress, meshopt, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [src, out] = process.argv.slice(2);
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
const root = doc.getRoot();

// 1. Drop small / hidden parts and every part that carries a logo.
const DROP = /Wipers|BrakePad|Pedal|HoodInterior|HoodUnder|InteriorRearHatch|InteriorRearPanels|InteriorDoor[LR]0[1-6]|Handle0|Engine|Axles|InteriorCage|InteriorSteering|License Plate|InteriorFloor$/;
for (const n of root.listNodes()) if (DROP.test(n.getName())) n.dispose();

// 2. Remove logo textures. Texture used as emissive "logo" mask on several materials:
const logoTex = root.listMaterials().find((m) => m.getName() === 'License')?.getBaseColorTexture();
for (const m of root.listMaterials()) {
  if (logoTex && m.getEmissiveTexture() === logoTex) {
    m.setEmissiveTexture(null);
    m.setEmissiveFactor([0, 0, 0]);
  }
  if (m.getName() === 'Tireside') {
    // sidewall texture + normal map contain the Khronos and 3D Commerce logos
    m.setBaseColorTexture(null);
    m.setBaseColorFactor([0.035, 0.035, 0.035, 1]);
    m.setNormalTexture(null);
    m.setRoughnessFactor(0.85);
  }
  if (m.getName() === 'Glass') {
    // Transmission needs an extra render pass: use cheap tinted alpha glass instead.
    for (const e of m.listExtensions()) m.setExtension(e.extensionName, null);
    m.setBaseColorFactor([0.04, 0.05, 0.06, 0.55]);
    m.setAlphaMode('BLEND');
    m.setMetallicFactor(0);
    m.setRoughnessFactor(0.05);
    m.setDoubleSided(false);
  }
  if (/Pearl|Graphite/.test(m.getName())) m.dispose(); // only used by material variants
}
const variants = root.listExtensionsUsed().find((e) => e.extensionName === KHRMaterialsVariants.EXTENSION_NAME);
if (variants) variants.dispose();

const tris = () => {
  let t = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return t;
};
await doc.transform(prune(), dedup(), weld());
console.log('tris after cleanup', tris());

// 3. Simplify, harder on rims (12k tris each) and seats than on body panels.
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const name = node.getName();
  const ratio = /Rim/.test(name) ? 0.09 : /Interior|Gasket/.test(name) ? 0.18 : /Body/.test(name) ? 0.36 : 0.35;
  for (const prim of mesh.listPrimitives()) {
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: /Rim|Interior/.test(name) ? 0.006 : 0.002, lockBorder: true });
  }
}
await doc.transform(prune());
console.log('tris after simplify', tris());

// 4. Textures: max 1024px WebP; the 2k occlusion map down to 1024.
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
  resample(),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
console.log('tris final', tris());
await io.write(out, doc);
