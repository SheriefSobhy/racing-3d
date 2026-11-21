import * as THREE from 'three';
import { frame, LANES } from './track.js';
import { buildTrafficTemplates, shadowMesh } from './cars.js';

const COLORS = [0xe8e8e8, 0x26282c, 0x9aa3ad, 0xb3202a, 0x2952a3, 0x2f7d4a, 0xd9a520, 0x6a3b8f, 0xf07c1b, 0x5fb7d8];
const LIMIT = 8.8;
const tmp = {};

export class Traffic {
  constructor(scene, tex) {
    this.scene = scene;
    this.tex = tex;
    this.templates = buildTrafficTemplates();
    this.totalWeight = this.templates.reduce((a, t) => a + t.weight, 0);
    this.bodyMats = COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c }));
    this.detMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.litMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.pool = this.templates.map(() => []);
    this.cars = [];
    this.nextS = 0;
    this.startS = 0;
  }

  makeCar(ti) {
    const t = this.templates[ti];
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    const body = new THREE.Mesh(t.body, this.bodyMats[0]);
    group.add(body);
    group.add(new THREE.Mesh(t.det, this.detMat));
    group.add(new THREE.Mesh(t.lit, this.litMat));
    group.add(shadowMesh(this.tex, t.width * 1.35, t.length * 1.15));
    return { group, body, ti, t };
  }

  reset(s) {
    for (const c of this.cars) this.recycle(c);
    this.cars.length = 0;
    this.startS = s;
    this.nextS = s + 90;
  }

  recycle(car) {
    this.scene.remove(car.group);
    this.pool[car.ti].push(car);
  }

  spawn(s, lane) {
    let r = Math.random() * this.totalWeight;
    let ti = 0;
    while (ti < this.templates.length - 1 && r > this.templates[ti].weight) r -= this.templates[ti++].weight;
    const car = this.pool[ti].pop() || this.makeCar(ti);
    car.body.material = this.bodyMats[Math.floor(Math.random() * this.bodyMats.length)];
    car.s = s;
    car.lane = lane;
    car.x = LANES[lane];
    car.targetX = car.x;
    car.baseV = (car.t.type === 'truck' ? 18 : 21) + Math.random() * 9;
    car.v = car.baseV;
    car.passed = false;
    car.hit = false;
    car.minGap = 99;
    car.yaw = 0;
    car.spinV = 0;
    car.vx = 0;
    car.lcTimer = Math.random() < 0.3 ? 1 + Math.random() * 5 : Infinity;
    this.scene.add(car.group);
    this.cars.push(car);
  }

  laneFree(lane, s, self) {
    for (const o of this.cars) {
      if (o === self || o.hit) continue;
      if (Math.abs(o.x - LANES[lane]) < 2.5 && Math.abs(o.s - s) < 16) return false;
    }
    return true;
  }

  update(dt, player, cb) {
    const diff = Math.min(1, Math.max(0, (player.s - this.startS) / 9000));

    // Spawn at a frontier ahead of the player.
    const frontier = player.s + 430;
    while (this.nextS < frontier) {
      const lanes = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
      const count = Math.random() < 0.22 + diff * 0.35 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const s = this.nextS + Math.random() * 8;
        if (s < player.s + 160 && Math.abs(LANES[lanes[i]] - player.x) < 3) continue;
        if (this.laneFree(lanes[i], s, null)) this.spawn(s, lanes[i]);
      }
      this.nextS += 48 - 22 * diff + Math.random() * 22;
    }

    const cars = this.cars;
    for (const car of cars) {
      if (car.hit) {
        car.v = Math.max(0, car.v - 9 * dt);
        car.x += car.vx * dt;
        car.vx *= Math.exp(-1.5 * dt);
        if (Math.abs(car.x) > LIMIT) {
          car.x = Math.sign(car.x) * LIMIT;
          car.vx = 0;
        }
        car.yaw += car.spinV * dt;
        car.spinV *= Math.exp(-1.4 * dt);
        continue;
      }
      // Follow a slower car ahead in the same lane.
      let limit = car.baseV;
      for (const o of cars) {
        if (o === car || o.hit) continue;
        const ds = o.s - car.s;
        if (ds > 0 && ds < 16 && Math.abs(o.x - car.x) < 2.6) limit = Math.min(limit, o.v);
      }
      car.v += (limit - car.v) * Math.min(1, dt * 3);
      // Occasional lane change.
      car.lcTimer -= dt;
      if (car.lcTimer <= 0) {
        car.lcTimer = Infinity;
        const opts = [car.lane - 1, car.lane + 1].filter((l) => l >= 0 && l < 4);
        const nl = opts[Math.floor(Math.random() * opts.length)];
        if (this.laneFree(nl, car.s, car)) {
          car.lane = nl;
          car.targetX = LANES[nl];
        }
      }
      const dx = car.targetX - car.x;
      car.x += Math.sign(dx) * Math.min(Math.abs(dx), 1.7 * dt);
      car.yaw = Math.max(-0.12, Math.min(0.12, dx * 0.06));
    }

    // Collisions and near misses (in road space: s along, x across).
    const pL = player.length;
    const pW = player.width;
    for (const car of cars) {
      car.s += car.v * dt;
      if (car.hit) continue;
      const lenSum = (pL + car.t.length) / 2;
      const widSum = (pW + car.t.width) / 2;
      const ds = car.s - player.s;
      if (Math.abs(ds) < lenSum) {
        const gap = Math.abs(car.x - player.x) - widSum;
        if (gap < car.minGap) car.minGap = gap;
        if (gap < 0 && player.invuln <= 0 && cb.canCrash()) {
          const side = Math.sign(car.x - player.x) || 1;
          car.hit = true;
          car.v = Math.max(car.v, player.v * 0.8);
          car.vx = side * (4 + Math.random() * 3);
          car.spinV = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2.5);
          cb.onCrash(car, side);
          continue;
        }
      }
      if (!car.passed && ds < -lenSum) {
        car.passed = true;
        if (car.minGap >= 0 && car.minGap < 1.3 && player.v > car.v + 8) cb.onNearMiss(car);
      }
    }

    // Recycle and place.
    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];
      if (car.s < player.s - 45 || car.s > player.s + 900) {
        this.recycle(car);
        cars.splice(i, 1);
        continue;
      }
      const f = frame(car.s, tmp);
      car.group.position.set(f.x + f.rx * car.x, f.y, f.z + f.rz * car.x);
      car.group.rotation.set(Math.atan(f.slope), -(f.th + car.yaw), 0);
    }
  }
}
