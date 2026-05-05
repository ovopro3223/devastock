// ===== تاكسي الأحرف 🚕 =====
import { awardLetter } from '../../core/rare-letters.js';
import { playCollectSound, playLoseLifeSound, startEngine, stopEngine } from '../../core/audio.js';
import { recordPlayStart, recordPlayEnd } from '../../core/game-stats.js';

const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';

// ===== أصول الصور =====
const ASSETS_PATH = 'assets/taxi/';
function loadImage(src) {
  const img = new Image();
  img.src = ASSETS_PATH + src;
  return img;
}
const ASSETS = {
  taxi:         loadImage('taxi.png'),
  cars:         [loadImage('car-1.png'), loadImage('car-2.png'), loadImage('car-3.png')],
  road:         loadImage('road.png'),
  buildings:    [loadImage('building-1.png'), loadImage('building-2.png')],
  sign:         loadImage('sign.png'),
  trafficLight: loadImage('traffic-light.png'),
};
function isImgReady(img) {
  return img && img.complete && img.naturalHeight > 0;
}

const NUM_LANES = 9;
const ROAD_WIDTH_RATIO = 0.86;   // نسبة عرض الطريق من الشاشة
const LETTER_SPACING = 240;       // مسافة عمودية بين الأحرف (أكبر = أقل)
const SIDE_LETTER_RATE = 0.005;   // احتمال ظهور حرف إضافي في كل إطار (قليل)
const MIN_LETTER_DIST = 90;       // أقل مسافة بين أي حرفين في نفس الشارع

const TREE_SPAWN_RATE = 0.010;
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
    // عدة مصادر لقياس الأبعاد — أكثر موثوقية على الموبايل
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(
      rect.width
      || this.canvas.clientWidth
      || this.canvas.parentElement?.clientWidth
      || window.innerWidth
    );
    const h = Math.round(
      rect.height
      || this.canvas.clientHeight
      || this.canvas.parentElement?.clientHeight
      || (window.innerHeight - 80)  // ارتفاع تقريبي بعد HUD
    );
    const oldW = this.W;
    this.canvas.width = w;
    this.canvas.height = h;
    this.W = w;
    this.H = h;

    // حافظ على موقع السيارة منطقياً
    if (this.W > 0) {
      if (oldW > 0 && oldW !== this.W && this.car && typeof this.car.x === 'number' && this.car.x > 0) {
        const ratio = this.car.x / oldW;
        this.car.x = ratio * this.W;
      } else if (!this.car || !this.car.x || this.car.x <= 0) {
        // أول مرة أو إذا كان 0 — وسط الطريق
        if (this.car) this.car.x = this._laneCenter(Math.floor(NUM_LANES / 2));
      }
    }
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
    // انتظر حتى يأخذ الكانفاس أبعاده الفعلية (مهم على الموبايل)
    let attempts = 0;
    const tryStart = () => {
      this._resize();
      if ((this.W === 0 || this.H === 0) && attempts < 60) {
        attempts++;
        // مزيج: rAF لـ 30 محاولة ثم setTimeout لـ 30 محاولة (في حال rAF متأخر على الـ background)
        if (attempts < 30) requestAnimationFrame(tryStart);
        else setTimeout(tryStart, 50);
        return;
      }
      // حتى لو فشل القياس، استخدم حجم النافذة كـ fallback
      if (this.W === 0 || this.H === 0) {
        this.W = window.innerWidth;
        this.H = window.innerHeight - 80;
        this.canvas.width = this.W;
        this.canvas.height = this.H;
      }
      this._actuallyStart();
    };
    requestAnimationFrame(tryStart);
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
    // اختر شارع لا يحتوي حرف قريب جداً
    let lane = -1;
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = Math.floor(Math.random() * NUM_LANES);
      const tooClose = this.letters.some(l =>
        l.lane === candidate && Math.abs(l.y - (-50)) < MIN_LETTER_DIST
      );
      if (!tooClose) { lane = candidate; break; }
    }
    if (lane === -1) return;  // كل الشوارع ممتلئة قرب الأعلى — تخطي
    const char = ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
    this.letters.push({ char, lane, y: -50, collected: false });
  }

  _spawnTree() {
    const lw = this._laneWidth();
    const roadLeft = (this.W - lw * NUM_LANES) / 2;
    const roadRight = roadLeft + lw * NUM_LANES;
    if (Math.random() < 0.7) {
      // ديكور جانبي خارج الطريق — مبنى أو لافتة
      const side = Math.random() < 0.5 ? 'left' : 'right';
      const kind = Math.random() < 0.65 ? 'building' : 'sign';
      const variant = kind === 'building' ? Math.floor(Math.random() * ASSETS.buildings.length) : 0;
      // المبنى أكبر فيحتاج موضعاً قريباً من الطريق، اللافتة أصغر
      const offset = kind === 'building'
        ? 90 + Math.random() * 60
        : 30 + Math.random() * 40;
      const fixedX = side === 'left'
        ? Math.max(60, roadLeft - offset)
        : Math.min(this.W - 60, roadRight + offset);
      this.trees.push({ kind, variant, fixedX, y: -200, onRoad: false });
    } else {
      // عقبة على الطريق — سيارة منافسة أو إشارة مرور
      const isLight = Math.random() < 0.2;
      const kind = isLight ? 'traffic-light' : 'car';
      const variant = kind === 'car' ? Math.floor(Math.random() * ASSETS.cars.length) : 0;
      const lane = Math.floor(Math.random() * NUM_LANES);
      this.trees.push({ kind, variant, lane, y: -60, onRoad: true, hit: false });
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

    // ظهور حرف بناء على المسافة (مضمون)
    if (this.distSinceLastLetter >= LETTER_SPACING) {
      this._spawnLetter();
      this.distSinceLastLetter = 0;
    }
    // ظهور حرف إضافي عشوائي (يضاعف الكثافة)
    if (Math.random() < SIDE_LETTER_RATE) this._spawnLetter();

    if (Math.random() < TREE_SPAWN_RATE) this._spawnTree();
    if (Math.random() < ITEM_SPAWN_RATE) this._spawnItem();

    // تحريك للأسفل
    for (const l of this.letters) l.y += this.speed;
    for (const t of this.trees)   t.y += this.speed;
    for (const item of this.items) item.y += this.speed;

    // الاصطدام — bounding box مطابق لرسم السيارة
    const size = this._objectSize();
    const carSize = Math.max(38, size * 1.25);
    const carHeight = carSize * 1.5;
    const carBottomOffset = Math.max(80, this.H * 0.18);
    const carHalfW = carSize * 0.5;
    const carBottom = this.H - carBottomOffset;
    const carTop = carBottom - carHeight;
    const objR = size * 0.5; // نصف قطر الحرف/الشجرة/العنصر

    for (const l of this.letters) {
      if (l.collected) continue;
      const lx = this._laneCenter(l.lane);
      // التقاط فور أول لمسة (بداية تداخل)
      if (Math.abs(lx - this.car.x) < carHalfW + objR * 0.6 &&
          l.y + objR >= carTop && l.y - objR <= carBottom) {
        l.collected = true;
        const r = awardLetter('taxi', l.char, this.multiplier);
        this.score += r.count;
        this._lettersCollectedThisRun = (this._lettersCollectedThisRun || 0) + r.count;
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
      if (Math.abs(tx - this.car.x) < carHalfW + objR * 0.6 &&
          t.y + objR >= carTop && t.y - objR <= carBottom) {
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
      if (Math.abs(ix - this.car.x) < carHalfW + objR * 0.6 &&
          item.y + objR >= carTop && item.y - objR <= carBottom) {
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
    // إذا الكانفاس فاضي، أعد القياس قبل الرسم
    if (!this.W || !this.H || this.W < 50 || this.H < 50) {
      this._resize();
      // fallback نهائي
      if (!this.W || this.W < 50) {
        this.W = window.innerWidth || 360;
        this.canvas.width = this.W;
      }
      if (!this.H || this.H < 50) {
        this.H = (window.innerHeight - 80) || 500;
        this.canvas.height = this.H;
      }
      // أعد ضبط موقع السيارة
      if (this.car) this.car.x = this._laneCenter(Math.floor(NUM_LANES / 2));
    }
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

    // ===== الطريق — صورة road.png مكررة عمودياً مع scroll =====
    if (isImgReady(ASSETS.road)) {
      const rImg = ASSETS.road;
      const tileH = roadW * (rImg.naturalHeight / rImg.naturalWidth);
      const off = this.scrollY % tileH;
      ctx.save();
      ctx.beginPath();
      ctx.rect(roadLeft, 0, roadW, H);
      ctx.clip();
      for (let y = -tileH + off; y < H + tileH; y += tileH) {
        ctx.drawImage(rImg, roadLeft, y, roadW, tileH);
      }
      ctx.restore();
    } else {
      // احتياطي
      const roadGrad = ctx.createLinearGradient(0, 0, 0, H);
      roadGrad.addColorStop(0, '#3a3a3a');
      roadGrad.addColorStop(1, '#252525');
      ctx.fillStyle = roadGrad;
      ctx.fillRect(roadLeft, 0, roadW, H);
    }

    // حواف الطريق (خط أبيض رفيع)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(roadLeft - 3, 0, 3, H);
    ctx.fillRect(roadRight,    0, 3, H);

    // خطوط الشوارع (رفيعة شفافة فوق صورة الطريق)
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([22, 18]);
    ctx.lineDashOffset = -(this.scrollY % 40);
    for (let i = 1; i < NUM_LANES; i++) {
      const x = roadLeft + i * lw;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // الأشجار / العقبات / الديكور — مرتبة حسب y (الأبعد للأقرب)
    const sortedObstacles = [...this.trees].sort((a, b) => a.y - b.y);
    for (const t of sortedObstacles) {
      const tx = t.onRoad ? this._laneCenter(t.lane) : t.fixedX;
      this._drawTree(t, tx, t.y, size);
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

    // السيارة — حماية من x غير صالح
    if (!this.car.x || this.car.x <= 0 || isNaN(this.car.x) || this.car.x > W) {
      this.car.x = this._laneCenter(Math.floor(NUM_LANES / 2));
    }
    // حجم السيارة أكبر شوي من الشارع للوضوح + موقع مرفوع كثيراً عن أسفل الشاشة
    const carSize = Math.max(38, size * 1.25);
    const carHeight = carSize * 1.5;
    // ارفعها لفوق ~18% من الشاشة عن الأسفل (أو 80px على الأقل) لتجنّب safe-area + URL bar
    const carY = H - carHeight - Math.max(80, H * 0.18);
    this._drawCar(this.car.x, carY, carSize);
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

  _drawTree(t, x, y, size) {
    const ctx = this.ctx;
    const kind = t.kind || (t.onRoad ? 'car' : 'building');

    // ===== عقبات على الطريق =====
    if (kind === 'car') {
      const img = ASSETS.cars[t.variant || 0];
      if (isImgReady(img)) {
        // الصورة الأصلية: الواجهة على اليسار، الخلف على اليمين
        // ندوّرها +π/2 (CW) عشان "اليسار يصير تحت" → السيارة المنافسة قادمة من الأعلى نحو اللاعب
        const carW = size * 0.95;                                            // عرض السيارة على الشارع
        const carH = carW * (img.naturalWidth / img.naturalHeight);          // طول السيارة بعد الدوران
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, -carH / 2, -carW / 2, carH, carW);
        ctx.restore();
      } else {
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(x - size * 0.4, y - size * 0.6, size * 0.8, size * 1.2);
      }
      return;
    }

    if (kind === 'traffic-light') {
      const img = ASSETS.trafficLight;
      if (isImgReady(img)) {
        const tw = size * 0.55;
        const th = tw * (img.naturalHeight / img.naturalWidth);
        ctx.drawImage(img, x - tw / 2, y - th * 0.5, tw, th);
      }
      return;
    }

    // ===== ديكور جانبي خارج الطريق =====
    if (kind === 'building') {
      const img = ASSETS.buildings[t.variant || 0];
      if (isImgReady(img)) {
        const bw = size * 2.3;
        const bh = bw * (img.naturalHeight / img.naturalWidth);
        // y هو موضع قاعدة المبنى
        ctx.drawImage(img, x - bw / 2, y - bh, bw, bh);
      } else {
        ctx.fillStyle = '#888';
        ctx.fillRect(x - size * 0.6, y - size * 1.5, size * 1.2, size * 1.5);
      }
      return;
    }

    if (kind === 'sign') {
      const img = ASSETS.sign;
      if (isImgReady(img)) {
        const sw = size * 0.7;
        const sh = sw * (img.naturalHeight / img.naturalWidth);
        ctx.drawImage(img, x - sw / 2, y - sh, sw, sh);
      }
      return;
    }
  }

  _drawCar(x, y, size) {
    const ctx = this.ctx;
    const img = ASSETS.taxi;
    const w = size;
    const h = size * 1.5;
    const top = y;
    const bottom = y + h;

    // ===== ظل تحت السيارة =====
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(x + 2, bottom + 3, w * 0.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isImgReady(img)) {
      // الصورة الأصلية أفقية (200×100): الواجهة على اليسار
      // ندوّرها -π/2 (CCW) عشان اليسار يصير فوق → السيارة تواجه أعلى الشاشة
      const carW = w;
      const carH = carW * (img.naturalWidth / img.naturalHeight);
      ctx.save();
      ctx.translate(x, top + h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, -carH / 2, -carW / 2, carH, carW);
      ctx.restore();
    } else {
      // احتياطي بسيط
      ctx.fillStyle = '#FFD700';
      this._roundRect(x - w / 2, top, w, h, w * 0.18);
      ctx.fill();
      ctx.strokeStyle = '#1A1A1A';
      ctx.lineWidth = 2.5;
      this._roundRect(x - w / 2, top, w, h, w * 0.18);
      ctx.stroke();
      ctx.fillStyle = '#1A1A1A';
      ctx.font = `bold ${Math.round(h * 0.15)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TAXI', x, top + h * 0.5);
    }
  }

  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
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
