import * as THREE from 'three';
import { frame, LANES } from './track.js';

const MAX_COINS = 160;
const MAX_NITRO = 8;
const tmp = {};
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

export class Pickups {
  constructor(scene) {
    const coinGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 14).rotateX(Math.PI / 2);
    const coinMat = new THREE.MeshLambertMaterial({ color: 0xffc81e, emissive: 0x7a5200 });
    this.coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, MAX_COINS);
    this.coinMesh.frustumCulled = false;
    this.coinMesh.count = 0;
    scene.add(this.coinMesh);

    const nGeo = new THREE.OctahedronGeometry(0.6, 0);
    const nMat = new THREE.MeshLambertMaterial({ color: 0x35b6ff, emissive: 0x0b4fae, flatShading: true });
    this.nitroMesh = new THREE.InstancedMesh(nGeo, nMat, MAX_NITRO);
    this.nitroMesh.frustumCulled = false;
    this.nitroMesh.count = 0;
    scene.add(this.nitroMesh);

    const rGeo = new THREE.TorusGeometry(0.95, 0.07, 6, 18);
    const rMat = new THREE.MeshBasicMaterial({
      color: 0x6fd6ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.ringMesh = new THREE.InstancedMesh(rGeo, rMat, MAX_NITRO);
    this.ringMesh.frustumCulled = false;
    this.ringMesh.count = 0;
    scene.add(this.ringMesh);

    this.coins = [];
    this.nitros = [];
    this.time = 0;
  }

  reset(s) {
    this.coins.length = 0;
    this.nitros.length = 0;
    this.nextCoinS = s + 70;
    this.nextNitroS = s + 380;
    this.render();
  }

  spawnCoinLine(s) {
    const n = 6 + Math.floor(Math.random() * 5);
    const l1 = Math.floor(Math.random() * 4);
    const l2 = Math.random() < 0.45 ? Math.max(0, Math.min(3, l1 + (Math.random() < 0.5 ? -1 : 1))) : l1;
    for (let i = 0; i < n; i++) {
      const t = Math.min(1, Math.max(0, (i - n / 3) / (n / 3)));
      const k = t * t * (3 - 2 * t);
      this.coins.push({ s: s + i * 6, x: LANES[l1] + (LANES[l2] - LANES[l1]) * k });
    }
  }

  update(dt, player, cb) {
    this.time += dt;
    const horizon = player.s + 400;
    while (this.nextCoinS < horizon) {
      this.spawnCoinLine(this.nextCoinS);
      this.nextCoinS += 130 + Math.random() * 170;
    }
    while (this.nextNitroS < horizon) {
      this.nitros.push({ s: this.nextNitroS, x: LANES[Math.floor(Math.random() * 4)] });
      this.nextNitroS += 520 + Math.random() * 480;
    }

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (Math.abs(c.s - player.s) < 2.4 && Math.abs(c.x - player.x) < 1.6) {
        this.coins.splice(i, 1);
        cb.onCoin(c);
      } else if (c.s < player.s - 10) this.coins.splice(i, 1);
    }
    for (let i = this.nitros.length - 1; i >= 0; i--) {
      const c = this.nitros[i];
      if (Math.abs(c.s - player.s) < 2.6 && Math.abs(c.x - player.x) < 1.9) {
        this.nitros.splice(i, 1);
        cb.onNitro(c);
      } else if (c.s < player.s - 10) this.nitros.splice(i, 1);
    }
    this.render();
  }

  worldPos(item, y, out) {
    const f = frame(item.s, tmp);
    return out.set(f.x + f.rx * item.x, f.y + y, f.z + f.rz * item.x);
  }

  render() {
    const t = this.time;
    let n = 0;
    for (const c of this.coins) {
      if (n >= MAX_COINS) break;
      const f = frame(c.s, tmp);
      _p.set(f.x + f.rx * c.x, f.y + 0.95 + Math.sin(t * 4 + c.s) * 0.08, f.z + f.rz * c.x);
      _q.setFromEuler(_e.set(0, -f.th + t * 3.2 + c.s * 0.3, 0));
      _m.compose(_p, _q, _s);
      this.coinMesh.setMatrixAt(n++, _m);
    }
    this.coinMesh.count = n;
    this.coinMesh.instanceMatrix.needsUpdate = true;

    n = 0;
    for (const c of this.nitros) {
      if (n >= MAX_NITRO) break;
      const f = frame(c.s, tmp);
      _p.set(f.x + f.rx * c.x, f.y + 1.2 + Math.sin(t * 3 + c.s) * 0.15, f.z + f.rz * c.x);
      _q.setFromEuler(_e.set(0, t * 2, 0));
      _m.compose(_p, _q, _s.set(1, 1, 1));
      this.nitroMesh.setMatrixAt(n, _m);
      const sc = 1 + Math.sin(t * 6) * 0.08;
      _q.setFromEuler(_e.set(0, -f.th, t * 1.5));
      _m.compose(_p, _q, _s.set(sc, sc, sc));
      this.ringMesh.setMatrixAt(n++, _m);
    }
    _s.set(1, 1, 1);
    this.nitroMesh.count = n;
    this.ringMesh.count = n;
    this.nitroMesh.instanceMatrix.needsUpdate = true;
    this.ringMesh.instanceMatrix.needsUpdate = true;
  }
}
