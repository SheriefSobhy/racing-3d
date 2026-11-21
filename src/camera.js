import * as THREE from 'three';
import { frame } from './track.js';

/** Selectable in-race camera views, in tap order. */
export const VIEWS = [
  { id: 'chase', name: 'CHASE' },
  { id: 'far', name: 'FAR CHASE' },
  { id: 'hood', name: 'HOOD' },
  { id: 'bumper', name: 'BUMPER' },
];
export const viewName = (id) => (VIEWS.find((v) => v.id === id) || VIEWS[0]).name;
export const isChaseView = (id) => id === 'chase' || id === 'far';

// Car-local mount points (car front faces -Z).
const MOUNTS = {
  hood: { pos: [0, 1.02, -1.3], look: [0, 0.95, -30] },
  bumper: { pos: [0, 0.52, -2.5], look: [0, 0.5, -30] },
};

const fTmp = {};
const look = new THREE.Vector3();

/** Drives the race camera from the player state and the user's camera settings. */
export class CameraRig {
  constructor(camera, settings) {
    this.camera = camera;
    this.settings = settings;
    this.baseFov = 62;
    this.fov = 62;
    this.shake = 0;
    this.reset();
  }

  reset() {
    this.init = false;
    this.x = 0;
    this.lx = 0;
    this.dist = this.settings.dist;
    this.h = this.settings.height;
  }

  kick(amount) {
    this.shake = Math.max(this.shake, amount);
  }

  /** Recompute the base FOV for the current aspect ratio and FOV setting. */
  resize(aspect) {
    const f = this.settings.fov;
    // In portrait keep a similar horizontal view by widening the vertical FOV.
    this.baseFov = aspect >= 1
      ? f
      : Math.min(105, (2 * Math.atan(Math.tan(((f + 4) * Math.PI) / 360) / aspect) * 180) / Math.PI);
    this.fov = this.baseFov;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  /** frozen: game paused, so no shake jitter and no shake decay. */
  update(dt, player, car, frozen = false) {
    const s = this.settings;
    const cam = this.camera;
    const view = s.view;

    if (isChaseView(view)) {
      const far = view === 'far';
      const k = this.init ? 1 - Math.exp(-dt * s.follow) : 1;
      const kd = this.init ? 1 - Math.exp(-dt * 4) : 1;
      this.x += (player.x * 0.82 - this.x) * k;
      this.lx += (player.x * 0.7 - this.lx) * k;
      const baseDist = s.dist * (far ? 1.6 : 1);
      const pull = s.speedFx && player.boosting ? baseDist * 0.17 : 0;
      this.dist += (baseDist + pull - this.dist) * kd;
      const targetH = s.height * (far ? 1.8 : 1) + (cam.aspect < 1 ? 0.5 : 0);
      this.h += (targetH - this.h) * kd;

      const f = frame(player.s - this.dist, fTmp);
      cam.position.set(f.x + f.rx * this.x, f.y + this.h, f.z + f.rz * this.x);
      const f2 = frame(player.s + (far ? 16 : 10), fTmp);
      look.set(f2.x + f2.rx * this.lx, f2.y + 0.9, f2.z + f2.rz * this.lx);
    } else {
      const m = MOUNTS[view];
      const root = car.root;
      root.updateMatrixWorld();
      root.localToWorld(cam.position.set(m.pos[0], m.pos[1], m.pos[2]));
      root.localToWorld(look.set(m.look[0], m.look[1], m.look[2]));
      // Keep chase state close so switching back is smooth.
      this.x = player.x * 0.82;
      this.lx = player.x * 0.7;
    }
    this.init = true;

    if (this.shake > 0 && !frozen) {
      if (s.shake) {
        const a = this.shake * this.shake * (isChaseView(view) ? 1 : 0.35);
        cam.position.x += (Math.random() - 0.5) * a;
        cam.position.y += (Math.random() - 0.5) * a;
        cam.position.z += (Math.random() - 0.5) * a;
      }
      this.shake = Math.max(0, this.shake - dt * 1.4);
    }
    cam.lookAt(look);

    let targetFov = this.baseFov;
    if (s.speedFx) {
      targetFov += Math.min(1, player.v / player.spec.maxSpeed) * 7 + (player.boosting ? 9 : 0);
    }
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-dt * 4));
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}
