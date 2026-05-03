// ===== تاكسي الأحرف 🚕 =====
import { awardLetter } from '../../core/rare-letters.js';
import { playCollectSound, playLoseLifeSound, startEngine, stopEngine } from '../../core/audio.js';
import { recordPlayStart, recordPlayEnd } from '../../core/game-stats.js';

const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';

const NUM_LANES = 9;
const ROAD_WIDTH_RATIO = 0.86;   // نسبة عرض الطريق من الشاشة
const LETTER_SPACING = 200;       // مسافة عمودية بين الأحرف

const TREE_SPAWN_RATE = 0.012;
const ITEM_SPAWN_RATE = 0.010;

const CAR_MAX_SPEED = 6;
const CAR_ACCEL = 0.22;
const CAR_FRICTION = 0.90;

export class TaxiGame {
  constructor(onExit) {
    this.onExit = onExit;
    this.canvas = document.getElementById('taxi-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.W = 0;
    this.H = 0;
    this.scrollY = 0;
    this.speed = 1.9;
    this.lives = 3;
    this.score = 0;

    this.car = { lane: Math.floor(NUM_LANES / 2), x: 0, vx: 0 };
    this.multiplier = 1;
    this.multiplierUses = 0;

    this.keys = { left: false, right: false };
    this.letters = [];
    this.trees = [];
    this.items = [];

    this.distSinceLastLetter = 0;
    this.running = false;
    this.paused = false;

    this._setupListeners();
  }

  _setupListeners() {
    document.getElementById('taxi-btn-pause').onclick = () => this.pause();
    document.getElementById('taxi-btn-resume').onclick = () => this.resume();
    document.getElementById('taxi-btn-quit-pause').onclick = () => this.quit();
    document.getElementById('taxi-btn-restart').onclick = () => this.restart();
    document.getElementById('taxi-btn-quit-gameover').onclick = () => this.quit();

    document.addEventListener('keydown', (e) => {
      if (!this.running || this.paused) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.keys.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.keys.right = true;
    });
    document.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.keys.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.keys.right = false;
    });

    // موبايل: سحب
    let lastTouchX = null;
    this.canvas.addEventListener('touchstart', (e) => {
      if (!this.running || this.paused) return;
      e.preventDefault();
      lastTouchX = e.touches[0].clientX;
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (!this.running || this.paused) return;
      e.preventDefault();
      const currentX = e.touches[0].clientX;
      const dx = currentX - (lastTouchX ?? currentX);
      lastTouchX = currentX;
      this.car.x += dx;
    }, { passive: false });

    this.canvas.addEventListener('touchend', () => { lastTouchX = null; });

    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.W = rect.width;
    this.H = rect.height;
  }

  // عرض الشارع الواحد
  _laneWidth() {
    return (this.W * ROAD_WIDTH_RATIO) / NUM_LANES;
  }

  // إحداثي X لمركز شارع رقم i (0..NUM_LANES-1)
  _laneCenter(i) {
    const lw = this._laneWidth();
    const roadLeft = (this.W - lw * NUM_LANES) / 2;
    return roadLeft + lw * (i + 0.5);
  }

  // الحجم الموحد للجميع = عرض الشارع
  _objectSize() {
    return this._laneWidth() * 0.85;
  }

  start() {
    requestAnimationFrame(() => {
      setTimeout(() => {
        this._resize();
        if (this.W === 0 || this.H === 0) {
          requestAnimationFrame(() => this._actuallyStart());
        } else {
          this._actuallyStart();
        }
      }, 100);
    });
  }

  _actuallyStart() {
    this._resize();
    this.lives = 3;
    this.score = 0;
    this.speed = 1.9;
    this.letters = [];
    this.trees = [];
    this.items = [];
    this.scrollY = 0;
    this.car.lane = Math.floor(NUM_LANES / 2);
    this.car.x = this._laneCenter(this.car.lane);
    this.car.vx = 0;
    this.keys.left = false;
    this.keys.right = false;
    this.distSinceLastLetter = LETTER_SPACING;
    this.multiplier = 1;
    this.multiplierUses = 0;
    this._updateHUD();
    this.running = true;
    this.paused = false;
    this._lettersCollectedThisRun = 0;
    document.getElementById('taxi-overlay-pause').hidden = true;
    document.getElementById('taxi-overlay-gameover').hidden = true;
    recordPlayStart('taxi');
    startEngine();
    this._loop();
  }

  pause() {
    if (!this.running) return;
    this.paused = true;
    stopEngine();
    document.getElementById('taxi-overlay-pause').hidden = false;
  }

  resume() {
    this.paused = false;
    document.getElementById('taxi-overlay-pause').hidden = true;
    startEngine();
    this._loop();
  }

  quit() {
    this.running = false;
    this.paused = false;
    stopEngine();
    document.getElementById('taxi-overlay-pause').hidden = true;
    document.getElementById('taxi-overlay-gameover').hidden = true;
    this.onExit();
  }

  restart() {
    document.getElementById('taxi-overlay-gameover').hidden = true;
    this.start();
  }

  _gameOver() {
    this.running = false;
    stopEngine();
    recordPlayEnd('taxi', {
      score: this.score,
      lettersCollected: this._lettersCollectedThisRun || 0,
      won: false,
    });
    document.getElementById('taxi-final-score').textContent = this.score;
    document.getElementById('taxi-overlay-gameover').hidden = false;
  }

  _updateHUD() {
    document.getElementById('taxi-score-value').textContent = this.score;
    const hearts = document.getElementById('taxi-hud-lives').children;
    for (let i = 0; i < 3; i++) {
      hearts[i].style.opacity = i < this.lives ? 1 : 0.2;
    }
    const bonus = document.getElementById('taxi-bonus-status');
    if (bonus) {
      bonus.textContent = this.multiplier > 1 ? `مضاعف x2 (${this.multiplierUses})` : '';
    }
  }

  _spawnLetter() {
    const lane = Math.floor(Math.random() * NUM_LANES);
    const char = ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
    this.letters.push({ char, lane, y: -50, collected: false });
  }

  _spawnTree() {
    const lw = this._laneWidth();
    const roadLeft = (this.W - lw * NUM_LANES) / 2;
    const roadRight = roadLeft + lw * NUM_LANES;
    if (Math.random() < 0.7) {
      // أشجار جانبية خارج الطريق — X ثابت عند الـ spawn
      const side = Math.random() < 0.5 ? 'left' : 'right';
      const fixedX = side === 'left'
        ? Math.max(20, roadLeft - 20 - Math.random() * Math.max(40, roadLeft - 40))
        : Math.min(this.W - 20, roadRight + 20 + Math.random() * Math.max(40, this.W - roadRight - 40));
      this.trees.push({ fixedX, y: -60, onRoad: false });
    } else {
      // عقبة على الطريق
      const lane = Math.floor(Math.random() * NUM_LANES);
      this.trees.push({ lane, y: -60, onRoad: true, hit: false });
    }
  }

  _spawnItem() {
    const type = Math.random() < 0.5 ? 'post' : 'x2';
    const lane = Math.floor(Math.random() * NUM_LANES);
    this.items.push({ type, lane, y: -70, collected: false });
  }

  _loop = () => {
    if (!this.running || this.paused) return;
    try {
      this._update();
      this._draw();
    } catch (e) {
      console.error('Taxi loop error:', e);
    }
    requestAnimationFrame(this._loop);
  };

  _update() {
    this.scrollY += this.speed;
    this.distSinceLastLetter += this.speed;

    // ===== حركة السيارة =====
    if (this.keys.left)  this.car.vx -= CAR_ACCEL * 6;
    if (this.keys.right) this.car.vx += CAR_ACCEL * 6;
    if (!this.keys.left && !this.keys.right) {
      this.car.vx *= CAR_FRICTION;
      if (Math.abs(this.car.vx) < 0.05) this.car.vx = 0;
    }
    if (this.car.vx >  CAR_MAX_SPEED) this.car.vx =  CAR_MAX_SPEED;
    if (this.car.vx < -CAR_MAX_SPEED) this.car.vx = -CAR_MAX_SPEED;

    this.car.x += this.car.vx;

    // حدود الطريق
    const roadW = this._laneWidth() * NUM_LANES;
    const roadLeft = (this.W - roadW) / 2;
    const half = this._objectSize() / 2;
    if (this.car.x < roadLeft + half) { this.car.x = roadLeft + half; this.car.vx = 0; }
    if (this.car.x > roadLeft + roadW - half) { this.car.x = roadLeft + roadW - half; this.car.vx = 0; }

    // ظهور حرف
    if (this.distSinceLastLetter >= LETTER_SPACING) {
      this._spawnLetter();
      this.distSinceLastLetter = 0;
    }
    if (Math.random() < TREE_SPAWN_RATE) this._spawnTree();
    if (Math.random() < ITEM_SPAWN_RATE) this._spawnItem();

    // تحريك للأسفل
    for (const l of this.letters) l.y += this.speed;
    for (const t of this.trees)   t.y += this.speed;
    for (const item of this.items) item.y += this.speed;

    // الاصطدام
    const carCenterY = this.H - 80;
    const carHalf = this._objectSize() * 0.55;

    for (const l of this.letters) {
      if (l.collected) continue;
      const lx = this._laneCenter(l.lane);
      if (Math.abs(lx - this.car.x) < carHalf && Math.abs(l.y - carCenterY) < carHalf) {
        l.collected = true;
        for (let i = 0; i < this.multiplier; i++) {
          const r = awardLetter('taxi', l.char);
          this.score += r.count;
          this._lettersCollectedThisRun = (this._lettersCollectedThisRun || 0) + r.count;
        }
        if (this.multiplier > 1) {
          this.multiplierUses -= 1;
          if (this.multiplierUses <= 0) { this.multiplier = 1; this.multiplierUses = 0; }
        }
        playCollectSound();
        this._updateHUD();
      }
    }

    for (const t of this.trees) {
      if (!t.onRoad || t.hit) continue;
      const tx = this._laneCenter(t.lane);
      if (Math.abs(tx - this.car.x) < carHalf && Math.abs(t.y - carCenterY) < carHalf) {
        t.hit = true;
        this.lives--;
        playLoseLifeSound();
        this._updateHUD();
        this.car.vx *= -0.5;
        if (this.lives <= 0) { this._gameOver(); return; }
      }
    }

    for (const item of this.items) {
      if (item.collected) continue;
      const ix = this._laneCenter(item.lane);
      if (Math.abs(ix - this.car.x) < carHalf && Math.abs(item.y - carCenterY) < carHalf) {
        item.collected = true;
        if (item.type === 'post') {
          this.score += 2;
        } else if (item.type === 'x2') {
          this.multiplier = 2;
          this.multiplierUses = 4;
        }
        playCollectSound();
        this._updateHUD();
      }
    }

    this.letters = this.letters.filter(l => l.y < this.H + 60 && !l.collected);
    this.trees   = this.trees.filter(t => t.y < this.H + 80);
    this.items   = this.items.filter(i => i.y < this.H + 80 && !i.collected);

    if (this.scrollY % 2500 < this.speed) {
      this.speed = Math.min(4.5, this.speed + 0.08);
    }
  }

  _draw() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    const lw = this._laneWidth();
    const roadW = lw * NUM_LANES;
    const roadLeft = (W - roadW) / 2;
    const roadRight = roadLeft + roadW;
    const size = this._objectSize();

    ctx.clearRect(0, 0, W, H);

    // الأرض الخضراء (الجانبية)
    ctx.fillStyle = '#4A8B3F';
    ctx.fillRect(0, 0, W, H);

    // الطريق المستقيم (لا منظور للكائنات)
    const roadGrad = ctx.createLinearGradient(0, 0, 0, H);
    roadGrad.addColorStop(0, '#3a3a3a');
    roadGrad.addColorStop(0.5, '#2e2e2e');
    roadGrad.addColorStop(1, '#252525');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(roadLeft, 0, roadW, H);

    // حواف الطريق (أبيض)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(roadLeft - 4, 0, 4, H);
    ctx.fillRect(roadRight,    0, 4, H);

    // خطوط فاصلة بين الشوارع (متقطعة)
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([22, 18]);
    const dashOffset = -(this.scrollY % 40);
    ctx.lineDashOffset = dashOffset;
    for (let i = 1; i < NUM_LANES; i++) {
      const x = roadLeft + i * lw;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // الأشجار
    for (const t of this.trees) {
      const tx = t.onRoad ? this._laneCenter(t.lane) : t.fixedX;
      this._drawTree(tx, t.y, size);
    }

    // الأحرف على الطريق
    for (const l of this.letters) {
      if (l.collected) continue;
      const lx = this._laneCenter(l.lane);
      this._drawLetter(lx, l.y, l.char, size);
    }

    // العناصر الخاصة
    for (const item of this.items) {
      if (item.collected) continue;
      const ix = this._laneCenter(item.lane);
      this._drawItem(ix, item.y, item.type, size);
    }

    // السيارة
    const carY = H - size * 1.6 - 16;
    this._drawCar(this.car.x, carY, size);
  }

  _drawLetter(x, y, char, size) {
    const ctx = this.ctx;
    const r = size * 0.5;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, '#FFF1B5');
    grad.addColorStop(0.6, '#FFD700');
    grad.addColorStop(1, '#DAA520');
    ctx.beginPath();
    ctx.fillStyle = grad;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.stroke();
    ctx.fillStyle = '#1A1A2E';
    ctx.font = `bold ${Math.round(size * 0.55)}px Cairo, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, x, y + 1);
  }

  _drawTree(x, y, size) {
    const ctx = this.ctx;
    // جذع
    ctx.fillStyle = '#6B4423';
    ctx.fillRect(x - size * 0.07, y, size * 0.14, size * 0.3);
    // أوراق
    ctx.fillStyle = '#2D6B2A';
    ctx.beginPath();
    ctx.arc(x, y - size * 0.05, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3F8B3D';
    ctx.beginPath();
    ctx.arc(x - size * 0.18, y - size * 0.18, size * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + size * 0.18, y - size * 0.18, size * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawCar(x, y, size) {
    const ctx = this.ctx;
    const w = size;
    const h = size * 1.6;
    const top = y;
    const bottom = y + h;

    // ظل
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(x, bottom + 4, w * 0.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // جسم السيارة (مستطيل بزوايا مدورة)
    const r = w * 0.18;
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + r, top);
    ctx.lineTo(x + w / 2 - r, top);
    ctx.quadraticCurveTo(x + w / 2, top, x + w / 2, top + r);
    ctx.lineTo(x + w / 2, bottom - r);
    ctx.quadraticCurveTo(x + w / 2, bottom, x + w / 2 - r, bottom);
    ctx.lineTo(x - w / 2 + r, bottom);
    ctx.quadraticCurveTo(x - w / 2, bottom, x - w / 2, bottom - r);
    ctx.lineTo(x - w / 2, top + r);
    ctx.quadraticCurveTo(x - w / 2, top, x - w / 2 + r, top);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#A37500';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // الزجاج الأمامي (top)
    ctx.fillStyle = 'rgba(40,60,90,0.85)';
    ctx.fillRect(x - w * 0.36, top + h * 0.12, w * 0.72, h * 0.18);
    // الزجاج الخلفي (bottom)
    ctx.fillRect(x - w * 0.36, bottom - h * 0.30, w * 0.72, h * 0.18);

    // علامة TAXI
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(x - w * 0.22, top + h * 0.42, w * 0.44, h * 0.10);
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${Math.round(h * 0.07)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TAXI', x, top + h * 0.47);

    // مصابيح أمامية (أبيض)
    ctx.fillStyle = '#FFF8DC';
    ctx.fillRect(x - w * 0.4, top + 2, w * 0.18, h * 0.05);
    ctx.fillRect(x + w * 0.22, top + 2, w * 0.18, h * 0.05);

    // مصابيح خلفية (حمراء)
    ctx.fillStyle = '#E74C3C';
    ctx.fillRect(x - w * 0.4, bottom - h * 0.05 - 2, w * 0.18, h * 0.05);
    ctx.fillRect(x + w * 0.22, bottom - h * 0.05 - 2, w * 0.18, h * 0.05);

    // عجلات (تظهر من الجانب)
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(x - w / 2 - 3, top + h * 0.18, 4, h * 0.16);
    ctx.fillRect(x + w / 2 - 1, top + h * 0.18, 4, h * 0.16);
    ctx.fillRect(x - w / 2 - 3, top + h * 0.66, 4, h * 0.16);
    ctx.fillRect(x + w / 2 - 1, top + h * 0.66, 4, h * 0.16);
  }

  _drawItem(x, y, type, size) {
    const ctx = this.ctx;
    if (type === 'post') {
      ctx.fillStyle = '#2f2f2f';
      ctx.fillRect(x - size * 0.4, y - size * 0.3, size * 0.8, size * 0.6);
      ctx.fillStyle = '#ffd523';
      ctx.fillRect(x - size * 0.4, y - size * 0.3, size * 0.8, size * 0.25);
      ctx.fillStyle = '#1A1A2E';
      ctx.font = `bold ${Math.round(size * 0.32)}px Cairo, Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('بوست', x, y - size * 0.18);
    } else if (type === 'x2') {
      ctx.fillStyle = 'rgba(255,215,0,0.95)';
      ctx.beginPath();
      ctx.arc(x, y, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e08d00';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#1A1A2E';
      ctx.font = `bold ${Math.round(size * 0.5)}px Cairo, Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('x2', x, y + 1);
    }
  }
}
