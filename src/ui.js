const $ = (id) => document.getElementById(id);

const SCREENS = ['menu', 'pause', 'gameover', 'garage'];

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'),
      score: $('score'),
      coins: $('coins'),
      speed: $('speed'),
      nitroFill: $('nitroFill'),
      nitroBar: document.querySelector('.nitro-bar'),
      lives: [...$('lives').children],
      popups: $('popups'),
      btnNitro: $('btnNitro'),
      nitroFx: $('nitroFx'),
      flash: $('flash'),
    };
    this.cache = {};
  }

  show(name) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
    this.el.hud.classList.toggle('hidden', !(name === 'hud' || name === 'pause'));
    if (name !== 'hud') this.el.nitroFx.classList.remove('on');
  }

  set(key, val, fn) {
    if (this.cache[key] !== val) {
      this.cache[key] = val;
      fn(val);
    }
  }

  hud(d) {
    const e = this.el;
    this.set('score', d.score, (v) => (e.score.textContent = v.toLocaleString('en-US')));
    this.set('coins', d.coins, (v) => (e.coins.textContent = v));
    this.set('speed', d.speed, (v) => (e.speed.textContent = v));
    this.set('nitro', d.nitro, (v) => (e.nitroFill.style.width = v + '%'));
    this.set('nfull', d.nitro >= 99, (v) => e.nitroBar.classList.toggle('full', v));
    this.set('nready', d.nitro > 3, (v) => e.btnNitro.classList.toggle('ready', v));
    this.set('boost', d.boosting, (v) => e.nitroFx.classList.toggle('on', v));
    this.set('lives', d.lives, (v) => e.lives.forEach((el, i) => el.classList.toggle('lost', i >= v)));
  }

  resetHud() {
    this.cache = {};
    this.el.popups.textContent = '';
  }

  popup(text, cls = '') {
    const p = document.createElement('div');
    p.className = 'popup ' + cls;
    p.textContent = text;
    const box = this.el.popups;
    while (box.children.length > 2) box.firstChild.remove();
    box.appendChild(p);
    setTimeout(() => p.remove(), 1150);
  }

  flash() {
    const f = this.el.flash;
    f.classList.remove('go');
    void f.offsetWidth; // restart animation
    f.classList.add('go');
  }

  menu(save) {
    $('menuBest').textContent = save.best.toLocaleString('en-US');
    $('menuCoins').textContent = save.coins.toLocaleString('en-US');
    for (const b of $('steerSeg').querySelectorAll('button')) b.classList.toggle('on', b.dataset.mode === save.steering);
  }

  gameOver(r) {
    $('goScore').textContent = r.score.toLocaleString('en-US');
    $('goBest').textContent = r.best.toLocaleString('en-US');
    $('goDist').textContent = (r.distance / 1000).toFixed(2) + ' km';
    $('goNear').textContent = r.nearMisses;
    $('goCoins').textContent = '+' + r.coins;
    $('newBest').classList.toggle('hidden', !r.isBest);
  }

  garage(spec, index, total, save) {
    $('carCount').textContent = `${index + 1} / ${total}`;
    $('carName').textContent = spec.name;
    $('garageCoins').textContent = save.coins.toLocaleString('en-US');
    const pct = (v, a, b) => Math.round(Math.max(0.05, Math.min(1, (v - a) / (b - a))) * 100) + '%';
    $('stSpeed').style.width = pct(spec.maxSpeed, 55, 88);
    $('stSpeedV').textContent = Math.round(spec.maxSpeed * 3.6);
    $('stAccel').style.width = pct(spec.accel, 8, 20);
    $('stAccelV').textContent = spec.accel;
    $('stHandling').style.width = pct(spec.handling, 0.8, 1.3);
    $('stHandlingV').textContent = spec.handling.toFixed(2);
    $('stNitro').style.width = pct(spec.nitro, 0.7, 1.4);
    $('stNitroV').textContent = spec.nitro.toFixed(2);

    const btn = $('carAction');
    const label = btn.firstElementChild;
    const owned = save.owned.includes(spec.id);
    if (owned && save.selected === spec.id) {
      label.textContent = 'SELECTED';
      btn.disabled = true;
    } else if (owned) {
      label.textContent = 'SELECT';
      btn.disabled = false;
    } else if (save.coins >= spec.price) {
      label.textContent = `BUY FOR ${spec.price}`;
      btn.disabled = false;
    } else {
      label.textContent = `LOCKED · ${spec.price}`;
      btn.disabled = true;
    }
  }
}
