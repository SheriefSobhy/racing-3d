import * as THREE from 'three';
import './style.css';
import { frame } from './track.js';
import { World } from './world.js';
import { CARS, buildPlayerCar, makeTextures, setCarQuality } from './cars.js';
import { loadAssets, loadHighAssets } from './assets.js';
import { Traffic } from './traffic.js';
import { Pickups } from './pickups.js';
import { Player, START_S } from './player.js';
import { Input } from './input.js';
import { Particles } from './effects.js';
import { UI } from './ui.js';
import { loadSave, writeSave, loadSettings, writeSettings, settingsDefaults } from './storage.js';
import { CameraRig, VIEWS, viewName } from './camera.js';
import { Sound } from './audio.js';

const DEBUG = /(^|[?&])debug(=|&|$)/.test(location.search.slice(1));
const MAX_LIVES = 3;

// ---------- Renderer / scene ----------
const maxPR = Math.min(window.devicePixelRatio || 1, 2);
let pixelRatio = maxPR;
const renderer = new THREE.WebGLRenderer({ antialias: maxPR < 1.5, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.id = 'c';
document.getElementById('app').prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 1200);
const settings = loadSettings();
const rig = new CameraRig(camera, settings);
const sound = new Sound(settings);

const tex = makeTextures();
let world = null; // created once assets are loaded
const traffic = new Traffic(scene, tex);
const pickups = new Pickups(scene);
const smoke = new Particles(scene, tex.smoke, 26, false);
const sparks = new Particles(scene, tex.glow, 40, true);
const player = new Player();
const input = new Input();
const ui = new UI();
const save = loadSave();
if (!CARS.some((c) => c.id === save.selected)) save.selected = 'vortex';

const specOf = (id) => CARS.find((c) => c.id === id) || CARS[0];
const models = {};
let car = null;

// ---------- Graphics quality ----------
let highAssets = null;
let gfxBusy = false;
async function applyGraphics(level, onProgress) {
  const high = level === 'high';
  if (high && !highAssets) highAssets = await loadHighAssets(renderer, onProgress);
  scene.environment = high ? highAssets.envMap : null;
  world.setQuality(high, highAssets);
  for (const m of Object.values(models)) setCarQuality(m, high);
}
async function setGraphics(level, chosen = true) {
  if (gfxBusy || !world) return;
  gfxBusy = true;
  settings.gfx = level;
  if (chosen) settings.gfxChosen = true;
  writeSettings(settings);
  ui.settings(settings, level === 'high' && !highAssets);
  try {
    await applyGraphics(level);
  } catch {
    settings.gfx = 'low';
    await applyGraphics('low');
  }
  gfxBusy = false;
  ui.settings(settings);
}
function showCar(id) {
  if (car) scene.remove(car.root);
  car = models[id];
  scene.add(car.root);
  car.flames.visible = false;
}

// ---------- Game state ----------
const game = {
  state: 'loading', // loading | menu | garage | playing | crashing | paused | gameover | settings | credits
  score: 0,
  coins: 0,
  crashes: 0,
  combo: 0,
  comboTimer: 0,
  nearMisses: 0,
  driftPts: 0,
  overTimer: 0,
  saveDirty: false,
};
let garageIndex = 0;
let orbit = 0;
let time = 0;

function flushSave() {
  if (game.saveDirty) {
    writeSave(save);
    game.saveDirty = false;
  }
}

function setState(s) {
  game.state = s;
  sound.setPaused(s === 'paused' || (s === 'settings' && settingsReturn === 'paused'));
  const map = {
    menu: 'menu', garage: 'garage', playing: 'hud', crashing: 'hud', paused: 'pause', gameover: 'gameover', settings: 'settings', credits: 'credits',
  };
  ui.show(map[s]);
  if (s === 'menu') ui.menu(save);
  if (s !== 'playing') input.releaseAll();
}

function toMenu() {
  flushSave();
  traffic.reset(player.s);
  pickups.reset(player.s);
  player.reset();
  player.x = 0;
  showCar(save.selected);
  smoke.clear();
  sparks.clear();
  world.update(player.s, 300, Infinity);
  setState('menu');
}

async function startRace() {
  if (save.steering === 'tilt') input.tiltMode = await input.enableTilt();
  document.body.classList.toggle('tilt-mode', input.tiltMode);
  showCar(save.selected);
  player.reset();
  player.spec = specOf(save.selected);
  traffic.reset(player.s);
  pickups.reset(player.s);
  smoke.clear();
  sparks.clear();
  Object.assign(game, {
    score: 0, coins: 0, crashes: 0, combo: 0, comboTimer: 0, nearMisses: 0, driftPts: 0, overTimer: 0,
  });
  world.update(player.s, 40, Infinity);
  rig.reset();
  rig.shake = 0;
  ui.resetHud();
  setState('playing');
  ui.popup('GO!', 'nitro');
  sound.go();
}

function pause() {
  if (game.state !== 'playing') return;
  flushSave();
  setState('paused');
}
function resume() {
  if (game.state !== 'paused') return;
  setState('playing');
  last = performance.now();
}

function gameOver() {
  const score = Math.floor(game.score);
  const isBest = score > save.best;
  if (isBest) save.best = score;
  game.saveDirty = true;
  flushSave();
  ui.gameOver({
    score, best: save.best, isBest, coins: game.coins, nearMisses: game.nearMisses, distance: player.s - START_S,
  });
  orbit = Math.PI * 0.8;
  setState('gameover');
}

function openGarage() {
  garageIndex = Math.max(0, CARS.findIndex((c) => c.id === save.selected));
  if (game.state === 'gameover') {
    traffic.reset(player.s);
    pickups.reset(player.s);
    player.x = 0;
  }
  refreshGarage();
  setState('garage');
}
function refreshGarage() {
  const spec = CARS[garageIndex];
  showCar(spec.id);
  ui.garage(spec, garageIndex, CARS.length, save);
}
function garageAction() {
  const spec = CARS[garageIndex];
  if (!save.owned.includes(spec.id)) {
    if (save.coins < spec.price) return;
    save.coins -= spec.price;
    save.owned.push(spec.id);
  }
  save.selected = spec.id;
  game.saveDirty = true;
  flushSave();
  refreshGarage();
}

// ---------- Gameplay callbacks ----------
const v3 = new THREE.Vector3();
const handlers = {
  canCrash: () => game.state === 'playing',
  onCrash(other, side) {
    sound.crash();
    game.crashes++;
    player.v *= 0.3;
    player.xv = -side * 5;
    player.invuln = 2;
    rig.kick(0.9);
    game.combo = 0;
    ui.flash();
    if (navigator.vibrate) navigator.vibrate(160);
    car.root.updateMatrixWorld();
    car.root.localToWorld(v3.set(side * 0.9, 0.7, -1.8));
    for (let i = 0; i < 12; i++) {
      sparks.emit(v3, {
        color: i % 2 ? 0xffb040 : 0xffffff, size: 0.5, grow: -0.4, life: 0.5,
        vx: (Math.random() - 0.5) * 10, vy: 2 + Math.random() * 5, vz: (Math.random() - 0.5) * 10,
      });
    }
    if (game.crashes >= MAX_LIVES) {
      game.state = 'crashing';
      game.overTimer = 1.5;
      ui.popup('WRECKED!', 'wreck');
    } else {
      ui.popup(`CRASH!  ${MAX_LIVES - game.crashes} LEFT`, 'crash');
    }
  },
  onNearMiss() {
    game.comboTimer = 3;
    game.combo = Math.min(game.combo + 1, 5);
    const pts = 150 * game.combo;
    game.score += pts;
    game.nearMisses++;
    sound.nearMiss(game.combo);
    player.nitro = Math.min(1, player.nitro + 0.05);
    ui.popup(game.combo > 1 ? `NEAR MISS x${game.combo}  +${pts}` : `NEAR MISS  +${pts}`, 'near');
  },
  onCoin(c) {
    sound.coin();
    game.coins++;
    game.score += 10;
    save.coins++;
    game.saveDirty = true;
    pickups.worldPos(c, 0.95, v3);
    for (let i = 0; i < 3; i++) {
      sparks.emit(v3, {
        color: 0xffd24a, size: 0.8, grow: 1.5, life: 0.35,
        vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 3,
      });
    }
  },
  onNitro(c) {
    sound.nitroPickup();
    player.nitro = Math.min(1, player.nitro + 0.4);
    game.score += 50;
    ui.popup('NITRO  +40%', 'nitro');
    pickups.worldPos(c, 1.2, v3);
    for (let i = 0; i < 6; i++) {
      sparks.emit(v3, {
        color: 0x5cc8ff, size: 1.2, grow: 2, life: 0.4,
        vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 5,
      });
    }
  },
};

// ---------- Car visuals ----------
const fTmp = {};
function placeOnRoad(obj, s, x, yaw) {
  const f = frame(s, fTmp);
  obj.position.set(f.x + f.rx * x, f.y, f.z + f.rz * x);
  obj.rotation.set(Math.atan(f.slope), -(f.th + yaw), 0);
}

let smokeAcc = 0;
function syncCar(dt, moving) {
  placeOnRoad(car.root, player.s, player.x, player.yaw);
  car.body.rotation.z = player.roll;
  if (moving) {
    const spin = (player.v * dt) / car.wheelR;
    for (const w of car.spins) w.rotation.x -= spin;
  }
  for (const w of car.steers) w.rotation.y = -player.steer * 0.4;
  car.flames.visible = player.boosting;
  if (player.boosting) {
    const s = 0.75 + Math.random() * 0.5;
    car.flames.scale.set(1, 1, s);
  }
  car.glowMat.opacity = player.invuln > 0 ? 1 : 0.85;
  const vis = player.invuln <= 0 || Math.floor(player.invuln * 12) % 2 === 0;
  car.body.visible = vis;
  for (const w of car.spins) w.parent.visible = vis;

  if (!moving) return;
  car.root.updateMatrixWorld();
  if (player.drifting || player.scraping) {
    smokeAcc += dt * 30;
    while (smokeAcc >= 1) {
      smokeAcc -= 1;
      if (player.drifting) {
        for (const x of [-0.9, 0.9]) {
          car.root.localToWorld(v3.set(x, 0.25, 1.4));
          smoke.emit(v3, { color: 0xdddddd, size: 0.8, grow: 3.2, life: 0.75, opacity: 0.55, vy: 0.8 });
        }
      }
      if (player.scraping) {
        car.root.localToWorld(v3.set(Math.sign(player.x) * 1.0, 0.5, (Math.random() - 0.5) * 3));
        sparks.emit(v3, {
          color: 0xffa030, size: 0.35, grow: -0.3, life: 0.35,
          vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 4,
        });
      }
    }
  }
}

// ---------- Cameras ----------
function orbitCamera(dt, radius, height, speed) {
  orbit += dt * speed;
  const p = car.root.position;
  camera.position.set(p.x + Math.sin(orbit) * radius, p.y + height, p.z + Math.cos(orbit) * radius);
  camera.lookAt(p.x, p.y + 0.6, p.z);
  if (camera.fov !== rig.baseFov) {
    camera.fov = rig.baseFov;
    camera.updateProjectionMatrix();
  }
}

// ---------- Camera settings ----------
let settingsReturn = 'menu';
function saveSettings() {
  writeSettings(settings);
}
function setView(id) {
  settings.view = id;
  saveSettings();
  ui.camView(id);
  if (game.state === 'settings') ui.settings(settings);
}
function cycleView() {
  const i = VIEWS.findIndex((v) => v.id === settings.view);
  setView(VIEWS[(i + 1) % VIEWS.length].id);
  if (game.state === 'playing') ui.popup(`CAMERA: ${viewName(settings.view)}`, 'cam');
}
function openSettings() {
  if (game.state !== 'menu' && game.state !== 'paused') return;
  settingsReturn = game.state;
  ui.settings(settings);
  setState('settings');
}
function closeSettings() {
  if (game.state !== 'settings') return;
  saveSettings();
  if (settingsReturn === 'paused') setState('paused');
  else setState('menu');
}

// ---------- Update ----------
function updateRace(dt) {
  const control = game.state === 'playing';
  player.update(dt, input, control);
  traffic.update(dt, player, handlers);
  pickups.update(dt, player, handlers);
  world.update(player.s, 40, 1);

  if (control) {
    game.score += player.v * dt * 0.5 * (player.boosting ? 1.5 : 1);
    if (player.drifting) {
      game.driftPts += player.v * dt * 0.8;
    } else if (game.driftPts > 0) {
      const pts = Math.round(game.driftPts);
      if (pts >= 25) {
        game.score += pts;
        ui.popup(`DRIFT  +${pts}`, 'drift');
        sound.driftScore();
      }
      game.driftPts = 0;
    }
  }
  if (game.comboTimer > 0 && (game.comboTimer -= dt) <= 0) game.combo = 0;

  syncCar(dt, true);
  rig.update(dt, player, car);

  ui.hud({
    score: Math.floor(game.score),
    coins: game.coins,
    speed: Math.round(player.v * 3.6),
    nitro: Math.round(player.nitro * 100),
    boosting: player.boosting,
    lives: MAX_LIVES - game.crashes,
  });

  if (game.state === 'crashing' && (game.overTimer -= dt) <= 0) gameOver();
}

function updateShowroom(dt) {
  world.update(player.s, 300, 2);
  player.steer = 0;
  player.yaw = 0;
  player.roll = 0;
  player.boosting = false;
  player.drifting = false;
  player.scraping = false;
  player.invuln = 0;
  syncCar(dt, false);
  if (game.state === 'garage') orbitCamera(dt, 7.2, 1.7, 0.35);
  else if (game.state === 'gameover') orbitCamera(dt, 8.5, 2.6, 0.15);
  else orbitCamera(dt, 7.5, 2.2, 0.22);
}

// ---------- Resize ----------
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  rig.resize(camera.aspect);
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---------- UI wiring ----------
const $ = (id) => document.getElementById(id);
const tap = (id, fn) => $(id).addEventListener('click', fn);
input.bindButton($('btnLeft'), 'left');
input.bindButton($('btnRight'), 'right');
input.bindButton($('btnNitro'), 'nitro');
input.bindButton($('btnDrift'), 'drift');

tap('btnPlay', startRace);
tap('btnGarage', openGarage);
tap('btnPause', pause);
tap('btnResume', resume);
tap('btnRestart', startRace);
tap('btnQuit', toMenu);
tap('btnAgain', startRace);
tap('btnGoGarage', openGarage);
tap('btnGoMenu', toMenu);
tap('btnBack', () => {
  showCar(save.selected);
  setState('menu');
});
tap('carPrev', () => {
  garageIndex = (garageIndex + CARS.length - 1) % CARS.length;
  refreshGarage();
});
tap('carNext', () => {
  garageIndex = (garageIndex + 1) % CARS.length;
  refreshGarage();
});
tap('carAction', garageAction);

// Camera button: react on pointerdown so it works while other fingers hold steer/nitro.
// Audio may only start after a user gesture; unlock on the first tap / key.
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, () => sound.unlock(), { capture: true });
// UI click sound for menu buttons (not the driving controls).
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('button');
  if (b && !b.closest('#controls')) sound.click();
});
function toggleMute() {
  settings.muted = !settings.muted;
  saveSettings();
  sound.apply();
  ui.mute(settings.muted);
  if (game.state === 'settings') ui.settings(settings);
}
$('btnMute').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  sound.unlock();
  toggleMute();
});
$('btnMute').addEventListener('contextmenu', (e) => e.preventDefault());
$('btnCam').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (game.state === 'playing') cycleView();
});
$('btnCam').addEventListener('contextmenu', (e) => e.preventDefault());
tap('btnPauseCam', cycleView);
tap('btnPauseSettings', openSettings);
tap('btnSettings', openSettings);
tap('btnSetDone', closeSettings);
tap('btnSetReset', () => {
  const prevGfx = settings.gfx;
  Object.assign(settings, settingsDefaults());
  rig.resize(camera.aspect);
  saveSettings();
  ui.settings(settings);
  sound.apply();
  if (settings.gfx !== prevGfx) setGraphics(settings.gfx, false);
});
for (const b of $('gfxSeg').querySelectorAll('button')) {
  b.addEventListener('click', () => {
    if (b.dataset.gfx !== settings.gfx || !settings.gfxChosen) setGraphics(b.dataset.gfx);
  });
}
tap('btnCredits', () => {
  if (game.state === 'menu') setState('credits');
});
tap('btnCreditsBack', () => {
  if (game.state === 'credits') setState('menu');
});
tap('btnRetryLoad', () => location.reload());
for (const b of $('viewSeg').querySelectorAll('button')) b.addEventListener('click', () => setView(b.dataset.view));
for (const el of $('settings').querySelectorAll('input[type=range]')) {
  el.addEventListener('input', () => {
    settings[el.dataset.key] = Number(el.value);
    sound.apply();
    if (el.dataset.key === 'fov') rig.resize(camera.aspect);
    ui.settings(settings);
  });
  el.addEventListener('change', saveSettings);
}
for (const b of $('settings').querySelectorAll('.toggle')) {
  b.addEventListener('click', () => {
    settings[b.dataset.key] = !settings[b.dataset.key];
    sound.apply();
    saveSettings();
    ui.settings(settings);
  });
}
ui.camView(settings.view);
ui.mute(settings.muted);

for (const b of $('steerSeg').querySelectorAll('button')) {
  b.addEventListener('click', async () => {
    let mode = b.dataset.mode;
    if (mode === 'tilt' && !(await input.enableTilt())) {
      mode = 'buttons';
      alert('Tilt steering is not available on this device.');
    }
    save.steering = mode;
    game.saveDirty = true;
    flushSave();
    ui.menu(save);
  });
}

const fsBtn = $('btnFull');
const root = document.documentElement;
if (!root.requestFullscreen && !root.webkitRequestFullscreen) fsBtn.classList.add('hidden');
fsBtn.addEventListener('click', () => {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    const p = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
    if (p && p.catch) p.catch(() => {});
  }
});

input.onKey = (code) => {
  if (code === 'KeyM') {
    toggleMute();
  } else if (code === 'KeyC' && (game.state === 'playing' || game.state === 'paused')) {
    cycleView();
  } else if (game.state === 'settings') {
    if (code === 'Escape') closeSettings();
  } else if (code === 'Escape' || code === 'KeyP') {
    if (game.state === 'playing') pause();
    else if (game.state === 'paused') resume();
  } else if (code === 'Enter' && (game.state === 'menu' || game.state === 'gameover')) {
    startRace();
  }
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    flushSave();
  }
});
addEventListener('pagehide', flushSave);

// ---------- Debug FPS ----------
let fpsEl = null;
if (DEBUG) {
  fpsEl = document.createElement('div');
  fpsEl.id = 'fps';
  document.body.appendChild(fpsEl);
}
let fpsFrames = 0;
let fpsTime = 0;
let perfFrames = 0;
let perfTime = 0;

// ---------- Loop ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0;
  const rawDt = dt;
  if (dt > 0.05) dt = 0.05;
  time += dt;

  switch (game.state) {
    case 'playing':
    case 'crashing':
      updateRace(dt);
      break;
    case 'menu':
    case 'garage':
    case 'gameover':
    case 'credits':
      updateShowroom(dt);
      break;
    case 'paused':
      // Frozen race, but camera changes preview live.
      rig.update(dt, player, car, true);
      break;
    case 'settings':
      if (settingsReturn === 'menu') updateShowroom(dt);
      else rig.update(dt, player, car, true);
      break;
    default:
      break;
  }
  if (game.state !== 'paused' && !(game.state === 'settings' && settingsReturn === 'paused')) {
    smoke.update(dt);
    sparks.update(dt);
  }
  sound.update(game.state === 'playing' || game.state === 'crashing' ? player : null);
  world.follow(camera);
  renderer.render(scene, camera);

  // Adaptive resolution: step down if the device can't hold ~50 fps.
  if (game.state === 'playing') {
    perfFrames++;
    perfTime += rawDt;
    if (perfTime > 2.5) {
      const fps = perfFrames / perfTime;
      if (fps < 48 && pixelRatio > 1) {
        pixelRatio = Math.max(1, pixelRatio - 0.25);
        renderer.setPixelRatio(pixelRatio);
      } else if (fps < 42 && settings.gfx === 'high' && !settings.gfxChosen) {
        // Still slow at the lowest resolution: fall back to Low graphics (only if the player never picked).
        setGraphics('low', false);
        ui.popup('GRAPHICS: LOW', 'cam');
      }
      perfFrames = 0;
      perfTime = 0;
    }
  }

  if (fpsEl) {
    fpsFrames++;
    fpsTime += rawDt;
    if (fpsTime >= 0.5) {
      const info = renderer.info.render;
      fpsEl.textContent = `${Math.round(fpsFrames / fpsTime)} FPS  ·  ${pixelRatio.toFixed(2)}x  ·  ${info.calls} calls  ·  ${(info.triangles / 1000).toFixed(1)}k tris`;
      fpsFrames = 0;
      fpsTime = 0;
    }
  }
}

// ---------- Boot: load assets behind the loading screen ----------
async function boot() {
  resize();
  const high = settings.gfx === 'high';
  try {
    const assets = await loadAssets(renderer, (f) => ui.loading(f * (high ? 0.8 : 0.95)));
    world = new World(scene, tex, assets);
    for (const spec of CARS) models[spec.id] = buildPlayerCar(spec, tex, assets.car);
    try {
      await applyGraphics(settings.gfx, (f) => ui.loading(0.8 + f * 0.15));
    } catch {
      settings.gfx = 'low';
      await applyGraphics('low');
    }
  } catch (err) {
    console.error(err);
    ui.loadFailed();
    return;
  }
  toMenu();
  renderer.compile(scene, camera); // avoid shader hitches on the first frames
  ui.loading(1);
  ui.loaded();
  if (DEBUG) window.__hb = { game, player, traffic, save, renderer, settings, setGraphics, world, scene, models, camera, sound };
  if (DEBUG && /autostart/.test(location.search)) startRace();
  last = performance.now();
  requestAnimationFrame(loop);
}
boot();
