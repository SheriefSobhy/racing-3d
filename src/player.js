import { curvature } from './track.js';

export const LIMIT = 8.7; // max lateral offset before scraping the rail
export const START_S = 400;

export class Player {
  constructor() {
    this.spec = null;
    this.length = 4.5;
    this.width = 1.95;
    this.reset();
  }

  reset() {
    this.s = START_S;
    this.x = 2;
    this.v = 0;
    this.xv = 0;
    this.steer = 0;
    this.nitro = 0.3;
    this.boosting = false;
    this.drifting = false;
    this.driftDir = 0;
    this.yaw = 0;
    this.roll = 0;
    this.invuln = 0;
    this.scraping = false;
  }

  update(dt, input, control) {
    const sp = this.spec;
    const steerIn = control ? input.steer() : 0;
    this.steer += (steerIn - this.steer) * Math.min(1, dt * 9);
    this.boosting = control && input.nitro() && this.nitro > 0.01;
    this.drifting = control && input.drift() && this.v > 14;

    // Longitudinal: auto-accelerate towards top speed.
    const maxV = sp.maxSpeed * (this.boosting ? 1.32 : 1);
    if (!control) {
      this.v = Math.max(0, this.v - 22 * dt);
    } else if (this.v < maxV) {
      const a = sp.accel * (this.boosting ? 2.2 : 1) * (1 - 0.55 * (this.v / maxV));
      this.v = Math.min(maxV, this.v + a * dt);
    } else {
      this.v = Math.max(maxV, this.v - (this.v - maxV) * 1.2 * dt);
    }
    if (this.drifting) this.v -= this.v * 0.07 * dt;

    if (this.boosting) this.nitro = Math.max(0, this.nitro - dt / (3.2 * sp.nitro));
    else if (control) this.nitro = Math.min(1, this.nitro + dt * 0.02);

    // Lateral: steering against the outward push of curves.
    const k = curvature(this.s);
    if (this.drifting) {
      if (Math.abs(this.steer) > 0.2) this.driftDir = Math.sign(this.steer);
      else if (this.driftDir === 0) this.driftDir = Math.sign(k) || 1;
    } else this.driftDir = 0;

    const latMax = (5 + this.v * 0.13) * sp.handling * (this.drifting ? 1.3 : 1);
    this.xv += (this.steer * latMax - this.xv) * Math.min(1, dt * (this.drifting ? 2.5 : 7));
    const push = -k * this.v * this.v * 0.2 * (this.drifting ? 0.2 : 1);
    this.x += (this.xv + push) * dt;

    this.scraping = false;
    if (Math.abs(this.x) > LIMIT) {
      const sg = Math.sign(this.x);
      this.x = sg * LIMIT;
      if (this.xv * sg > 0) this.xv = -sg * 1.5;
      this.v -= this.v * 0.5 * dt;
      this.scraping = this.v > 5;
    }

    if (this.drifting) {
      const gain = 0.1 * (0.4 + Math.min(1, Math.abs(this.steer) + Math.abs(k) * 400)) * Math.min(1, this.v / 40);
      this.nitro = Math.min(1, this.nitro + gain * dt);
    }

    this.s += this.v * dt;

    // Visual body motion
    const yawT = this.drifting ? this.driftDir * 0.42 : this.steer * 0.08 * Math.min(1, this.v / 20);
    this.yaw += (yawT - this.yaw) * Math.min(1, dt * (this.drifting ? 4 : 8));
    const rollT = this.steer * 0.04 + (this.drifting ? this.driftDir * 0.03 : 0);
    this.roll += (rollT - this.roll) * Math.min(1, dt * 6);
    if (this.invuln > 0) this.invuln -= dt;
  }
}
