import * as THREE from 'three';

/** Tiny sprite particle pool (smoke, sparks, coin sparkles). */
export class Particles {
  constructor(scene, map, count, additive) {
    this.items = [];
    this.i = 0;
    for (let k = 0; k < count; k++) {
      const mat = new THREE.SpriteMaterial({
        map,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      scene.add(sp);
      this.items.push({ sp, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1, grow: 0, op: 1 });
    }
  }

  emit(pos, o = {}) {
    const p = this.items[this.i];
    this.i = (this.i + 1) % this.items.length;
    p.sp.position.copy(pos);
    p.sp.material.color.setHex(o.color ?? 0xffffff);
    p.life = p.max = o.life ?? 0.8;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.vz = o.vz || 0;
    p.size = o.size || 1;
    p.grow = o.grow || 0;
    p.op = o.opacity ?? 1;
    p.sp.scale.setScalar(p.size);
    p.sp.material.opacity = p.op;
    p.sp.visible = true;
  }

  update(dt) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sp.visible = false;
        continue;
      }
      p.sp.position.x += p.vx * dt;
      p.sp.position.y += p.vy * dt;
      p.sp.position.z += p.vz * dt;
      p.size += p.grow * dt;
      p.sp.scale.setScalar(p.size);
      p.sp.material.opacity = p.op * (p.life / p.max);
    }
  }

  clear() {
    for (const p of this.items) {
      p.life = 0;
      p.sp.visible = false;
    }
  }
}
