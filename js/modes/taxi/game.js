// ===== تاكسي الأحرف 🚕 =====
import { saveLetterToStock } from '../../core/storage.js';
import { recordLetter } from '../../core/lifetime-storage.js';
import { playCollectSound, playLoseLifeSound, startEngine, stopEngine } from '../../core/audio.js';

const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
const LETTER_SPACING = 220;   // مسافة عمودية بين الأحرف
const TREE_SPAWN_RATE = 0.020;
const ITEM_SPAWN_RATE = 0.010;
const OPPOSING_CAR_SPAWN_RATE = 0.008; // احتمال ظهور سيارة معاكسة
const CAR_MAX_SPEED = 7;      // السرعة الأفقية القصوى للسيارة
const CAR_ACCEL = 0.35;       // تسارع الانتقال
const CAR_FRICTION = 0.85;    // احتكاك (لتقليل السرعة عند ترك المفتاح)
const ROAD_WIDTH_RATIO = 0.52;  // نسبة عرض الطريق من عرض الشاشة
const CAR_WIDTH_RATIO = 0.34;  // نسبة عرض السيارة = شارع واحد من الثلاث (~1/3)
const ROAD_TOP_WIDTH_RATIO = 0.18; // طول الطريق عند الأفق
const ROAD_SCROLL_HORIZON = 0.18; // موقع الأفق بالنسبة للارتفاع
const ROAD_OFFSET_MAX = 0.3;      // انحراف الطريق الأقصى
const ROAD_CURVE_SPEED = 0.018;   // سرعة تغيير المنحنى

// ألوان السيارات المعاكسة
const OPPOSING_CAR_COLORS = [
  { body: '#E74C3C', dark: '#A93226' },  // أحمر
  { body: '#3498DB', dark: '#21618C' },  // أزرق
  { body: '#2ECC71', dark: '#1E8449' },  // أخضر
  { body: '#9B59B6', dark: '#6C3483' },  // بنفسجي
  { body: '#F39C12', dark: '#B9770E' },  // برتقالي
  { body: '#FFFFFF', dark: '#BDC3C7' },  // أبيض
];

export class TaxiGame {
  constructor(onExit) {
    this.onExit = onExit;
    this.canvas = document.getElementById('taxi-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.W = 0;
    this.H = 0;
    this.roadX = 0;
    this.roadOffset = 0;
    this.roadTargetOffset = 0;
    this.scrollY = 0;
    this.speed = 5;
    this.lives = 3;
    this.score = 0;

    // السيارة - حركة سلسة بدون lanes
    this.car = {
      x: 0,            // إزاحة نسبية عن مركز الطريق (-1 إلى 1)
      vx: 0,
      width: 50,
      height: 90,
    };

    this.multiplier = 1;
    this.multiplierUses = 0;

    // مفاتيح التحكم
    this.keys = {
      left: false,
      right: false,
    };

    this.letters = [];
    this.trees = [];
    this.items = [];
    this.opposingCars = [];

    this.distSinceLastLetter = 0;
    this.distSinceLastOpposing = 0;
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

    // ===== كيبورد: حركة بالأسهم =====
    document.addEventListener('keydown', (e) => {
      if (!this.running || this.paused) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.keys.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.keys.right = true;
    });
    document.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.keys.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.keys.right = false;
    });

    // ===== موبايل: سحب السيارة (drag) أو سحب على الشاشة =====
    let dragStartX = null;
    let lastTouchX = null;

    this.canvas.addEventListener('touchstart', (e) => {
      if (!this.running || this.paused) return;
      e.preventDefault();
      dragStartX = e.touches[0].clientX;
      lastTouchX = dragStartX;
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (!this.running || this.paused) return;
      e.preventDefault();
      const currentX = e.touches[0].clientX;
      const dx = currentX - (lastTouchX ?? currentX);
      lastTouchX = currentX;
      // سحب مباشر للسيارة - كل بكسل سحب يحرك السيارة
      const roadWidth = this.W * ROAD_WIDTH_RATIO;
      this.car.x += dx / roadWidth * 1.5;
      // حدود
      if (this.car.x >  0.42) this.car.x =  0.42;
      if (this.car.x < -0.42) this.car.x = -0.42;
    }, { passive: false });

    this.canvas.addEventListener('touchend', () => {
      dragStartX = null;
      lastTouchX = null;
    });

    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.W = rect.width;
    this.H = rect.height;
    const roadWidth = this.W * ROAD_WIDTH_RATIO;
    this.car.width = Math.min(roadWidth * CAR_WIDTH_RATIO, 120);
    this.car.height = this.car.width * 1.9;
  }

  _roadWidthAt(y) {
    const t = Math.min(Math.max(y / this.H, 0), 1);
    return this.W * ROAD_WIDTH_RATIO * (ROAD_TOP_WIDTH_RATIO + (1 - ROAD_TOP_WIDTH_RATIO) * t);
  }

  _roadCenterAt(y) {
    // مركز الطريق مع انحناء بيرسبكتيف
    const t = Math.min(Math.max(y / this.H, 0), 1);
    // الانحراف يبدو أكبر عند الأفق (top) ويختفي قرب اللاعب (bottom)
    const curveStrength = (1 - t) * this.roadOffset * this.W * 0.4;
    return this.W / 2 + curveStrength;
  }

  _roadXAt(width) {
    return (this.W - width) / 2;
  }

  _easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
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
    this.letters = [];
    this.trees = [];
    this.items = [];
    this.opposingCars = [];
    this.scrollY = 0;
    this.roadOffset = 0;
    this.roadTargetOffset = 0;
    this.car.x = 0;
    this.car.vx = 0;
    this.keys.left = false;
    this.keys.right = false;
    this.distSinceLastLetter = LETTER_SPACING;
    this.distSinceLastOpposing = 400;
    this.multiplier = 1;
    this.multiplierUses = 0;
    this._updateHUD();
    this.running = true;
    this.paused = false;
    document.getElementById('taxi-overlay-pause').hidden = true;
    document.getElementById('taxi-overlay-gameover').hidden = true;
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
    // x: إزاحة عشوائية ضمن عرض الطريق (-0.4 إلى 0.4)
    const x = (Math.random() - 0.5) * 0.7;
    const char = ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
    this.letters.push({
      char,
      x,
      y: -50,
      collected: false,
    });
  }

  _spawnTree() {
    // الشجرة على جانب الطريق (يسار أو يمين)
    const side = Math.random() < 0.5 ? -1 : 1;
    this.trees.push({
      side,
      offset: 0.55 + Math.random() * 0.15,
      y: -60,
      onRoad: false,
    });

    // أو شجرة على الطريق (عقبة)
    if (Math.random() < 0.4) {
      const x = (Math.random() - 0.5) * 0.7; // إزاحة عشوائية على الطريق
      this.trees.push({
        side: 0,
        x,
        y: -60,
        onRoad: true,
      });
    }
  }

  _spawnItem() {
    const types = ['post', 'x2'];
    const type = types[Math.floor(Math.random() * types.length)];
    this.items.push({
      type,
      x: (Math.random() - 0.5) * 0.65,
      y: -70,
      collected: false,
    });
  }

  _spawnOpposingCar() {
    // اختر شارعاً (مسار) — على الجانب الآخر من السيارة عادةً
    // Lanes: -0.34 (يسار), 0, 0.34 (يمين). السيارات المعاكسة تأتي عشوائياً
    const lanes = [-0.32, 0, 0.32];
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    const color = OPPOSING_CAR_COLORS[Math.floor(Math.random() * OPPOSING_CAR_COLORS.length)];
    this.opposingCars.push({
      x: lane,
      y: -100,
      color,
      hit: false,
    });
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
    // إزاحة الطريق
    this.roadX += this.speed;
    this.scrollY += this.speed;
    this.distSinceLastLetter += this.speed;

    // ===== انحناء الطريق المتغير =====
    if (Math.random() < 0.009) {
      this.roadTargetOffset = (Math.random() * 2 - 1) * ROAD_OFFSET_MAX;
    }
    this.roadOffset += (this.roadTargetOffset - this.roadOffset) * ROAD_CURVE_SPEED;

    // ===== حركة السيارة السلسة =====
    // تطبيق التسارع حسب المفاتيح المضغوطة
    if (this.keys.left)  this.car.vx -= CAR_ACCEL;
    if (this.keys.right) this.car.vx += CAR_ACCEL;
    // إذا لا مفتاح ضغوط، تطبيق احتكاك
    if (!this.keys.left && !this.keys.right) {
      this.car.vx *= CAR_FRICTION;
      if (Math.abs(this.car.vx) < 0.05) this.car.vx = 0;
    }
    // تحديد السرعة القصوى
    if (this.car.vx >  CAR_MAX_SPEED) this.car.vx =  CAR_MAX_SPEED;
    if (this.car.vx < -CAR_MAX_SPEED) this.car.vx = -CAR_MAX_SPEED;

    // تطبيق السرعة على الموقع (نسبي بعرض الطريق)
    const roadWidth = this.W * ROAD_WIDTH_RATIO;
    this.car.x += this.car.vx / roadWidth;

    // حدود الطريق
    if (this.car.x >  0.42) { this.car.x =  0.42; this.car.vx = 0; }
    if (this.car.x < -0.42) { this.car.x = -0.42; this.car.vx = 0; }

    // ظهور حرف بناء على المسافة
    if (this.distSinceLastLetter >= LETTER_SPACING) {
      this._spawnLetter();
      this.distSinceLastLetter = 0;
    }

    // ظهور أشجار عشوائي
    if (Math.random() < TREE_SPAWN_RATE) this._spawnTree();
    if (Math.random() < ITEM_SPAWN_RATE) this._spawnItem();

    // ظهور سيارات معاكسة بفاصل آمن
    this.distSinceLastOpposing += this.speed;
    if (this.distSinceLastOpposing > 350 && Math.random() < OPPOSING_CAR_SPAWN_RATE) {
      this._spawnOpposingCar();
      this.distSinceLastOpposing = 0;
    }

    // تحريك الكائنات للأسفل
    for (const l of this.letters) l.y += this.speed;
    for (const t of this.trees)   t.y += this.speed;
    for (const item of this.items) item.y += this.speed;
    // السيارات المعاكسة تأتي أسرع (سرعة الطريق + سرعتها الذاتية)
    for (const oc of this.opposingCars) oc.y += this.speed * 1.6;

    // تحقق من اصطدام الأحرف
    const carCenterY = this.H - 100;
    const roadCenterX = this._roadCenterAt(carCenterY);
    const carScreenX = roadCenterX + this.car.x * roadWidth;

    const carHalfW = this.car.width / 2;
    const carHalfH = this.car.height / 2;

    for (const l of this.letters) {
      if (l.collected) continue;
      const roadWidthAtY = this._roadWidthAt(l.y);
      const centerAtY = this._roadCenterAt(l.y);
      const lx = centerAtY + l.x * roadWidthAtY * 0.46;
      const dx = lx - carScreenX;
      const dy = l.y - carCenterY;
      if (Math.abs(dx) < carHalfW + 15 && Math.abs(dy) < carHalfH + 5) {
        l.collected = true;
        this.score += this.multiplier;
        for (let i = 0; i < this.multiplier; i++) {
          saveLetterToStock(l.char);
          recordLetter(l.char, 1);
        }
        if (this.multiplier > 1) {
          this.multiplierUses -= 1;
          if (this.multiplierUses <= 0) {
            this.multiplier = 1;
            this.multiplierUses = 0;
          }
        }
        playCollectSound();
        this._updateHUD();
      }
    }

    // تحقق من اصطدام الأشجار
    for (const t of this.trees) {
      if (!t.onRoad || t.hit) continue;
      const roadWidthAtY = this._roadWidthAt(t.y);
      const centerAtY = this._roadCenterAt(t.y);
      const tx = centerAtY + t.x * roadWidthAtY * 0.45;
      const dx = tx - carScreenX;
      const dy = t.y - carCenterY;
      if (Math.abs(dx) < carHalfW + 5 && Math.abs(dy) < carHalfH + 10) {
        t.hit = true;
        this.lives--;
        playLoseLifeSound();
        this._updateHUD();
        this.car.vx *= -0.5;
        if (this.lives <= 0) {
          this._gameOver();
          return;
        }
      }
    }

    // تحقق من اصطدام العناصر الخاصة
    for (const item of this.items) {
      if (item.collected) continue;
      const roadWidthAtY = this._roadWidthAt(item.y);
      const ix = roadCenterX + item.x * roadWidthAtY * 0.46;
      const dx = ix - carScreenX;
      const dy = item.y - carCenterY;
      if (Math.abs(dx) < carHalfW + 20 && Math.abs(dy) < carHalfH + 10) {
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

    // ===== تحقق من اصطدام بسيارة معاكسة → خسارة فورية =====
    for (const oc of this.opposingCars) {
      if (oc.hit) continue;
      const roadWidthAtY = this._roadWidthAt(oc.y);
      const centerAtY = this._roadCenterAt(oc.y);
      const ocx = centerAtY + oc.x * roadWidthAtY * 0.45;
      const dx = ocx - carScreenX;
      const dy = oc.y - carCenterY;
      // hitbox السيارة المعاكسة
      if (Math.abs(dx) < carHalfW + this.car.width * 0.4 && Math.abs(dy) < carHalfH + this.car.height * 0.45) {
        oc.hit = true;
        playLoseLifeSound();
        // خسارة فورية!
        this.lives = 0;
        this._updateHUD();
        this._gameOver();
        return;
      }
    }

    // إزالة الكائنات خارج الشاشة
    this.letters       = this.letters.filter(l => l.y < this.H + 50 && !l.collected);
    this.trees         = this.trees.filter(t => t.y < this.H + 80);
    this.items         = this.items.filter(i => i.y < this.H + 80 && !i.collected);
    this.opposingCars  = this.opposingCars.filter(oc => oc.y < this.H + 100 && !oc.hit);

    // تسريع تدريجي
    if (this.scrollY % 1500 < this.speed) {
      this.speed = Math.min(12, this.speed + 0.3);
    }
  }

  _draw() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;

    // مسح الشاشة
    ctx.clearRect(0, 0, W, H);

    // السماء
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    sky.addColorStop(0, '#87CEEB');
    sky.addColorStop(1, '#B7E2F0');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.5);

    // الأرض الجانبية (أخضر)
    ctx.fillStyle = '#4A8B3F';
    ctx.fillRect(0, H * 0.5, W, H * 0.5);

    // الطريق
    const roadW = W * ROAD_WIDTH_RATIO;
    const roadTopW = roadW * ROAD_TOP_WIDTH_RATIO;
    const leftTop = W / 2 - roadTopW / 2;
    const rightTop = W / 2 + roadTopW / 2;
    const leftBottom = W / 2 - roadW / 2;
    const rightBottom = W / 2 + roadW / 2;

    const roadGradient = ctx.createLinearGradient(0, 0, 0, H);
    roadGradient.addColorStop(0, '#4b4b4b');
    roadGradient.addColorStop(0.5, '#2e2e2e');
    roadGradient.addColorStop(1, '#1b1b1b');
    ctx.fillStyle = roadGradient;
    ctx.beginPath();
    ctx.moveTo(leftTop, 0);
    ctx.lineTo(rightTop, 0);
    ctx.lineTo(rightBottom, H);
    ctx.lineTo(leftBottom, H);
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.moveTo(leftTop, 0);
    ctx.lineTo(leftBottom, H);
    ctx.moveTo(rightTop, 0);
    ctx.lineTo(rightBottom, H);
    ctx.stroke();

    ctx.fillStyle = '#FFD700';
    const stripeH = 30, stripeGap = 60;
    const stripeOffset = this.roadX % (stripeH + stripeGap);
    for (let y = -stripeOffset; y < H; y += stripeH + stripeGap) {
      const widthAtY = this._roadWidthAt(y) * 0.02;
      const alpha = 0.4 + 0.4 * (1 - y / H);
      ctx.fillStyle = `rgba(255,215,0,${alpha})`;
      ctx.fillRect(W / 2 - widthAtY / 2, y, widthAtY, stripeH);
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    for (const offset of [0.3, 0.7]) {
      ctx.beginPath();
      for (let y = 0; y <= H; y += 16) {
        const x = W / 2 + (offset - 0.5) * this._roadWidthAt(y);
        if (y === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // رسم الأشجار
    for (const t of this.trees) {
      if (t.onRoad) {
        const roadWidthAtY = this._roadWidthAt(t.y);
        const tx = W / 2 + t.x * roadWidthAtY * 0.45;
        this._drawTree(tx, t.y, 28, 0.8);
      } else {
        const tx = W / 2 + t.side * t.offset * W;
        this._drawTree(tx, t.y, 50, 1.0);
      }
    }

    // رسم الأحرف على الطريق
    for (const l of this.letters) {
      if (l.collected) continue;
      const roadWidthAtY = this._roadWidthAt(l.y);
      const lx = W / 2 + l.x * roadWidthAtY * 0.46;
      const ly = l.y;
      const size = 24 + (1 - ly / H) * 10;
      const gradient = ctx.createRadialGradient(lx, ly, 0, lx, ly, size);
      gradient.addColorStop(0, '#FFF1B5');
      gradient.addColorStop(0.4, '#FFD700');
      gradient.addColorStop(1, '#DAA520');
      ctx.beginPath();
      ctx.fillStyle = gradient;
      ctx.arc(lx, ly, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.stroke();
      ctx.fillStyle = '#1A1A2E';
      ctx.font = `bold ${Math.round(size * 0.9)}px Cairo, Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(l.char, lx, ly + 1);
    }

    // رسم العناصر الخاصة
    for (const item of this.items) {
      if (item.collected) continue;
      const roadWidthAtY = this._roadWidthAt(item.y);
      const ix = W / 2 + item.x * roadWidthAtY * 0.46;
      this._drawItem(ix, item.y, item.type, roadWidthAtY * 0.08);
    }

    // رسم السيارات المعاكسة (مع تكبير حسب البعد لإيهام perspective)
    for (const oc of this.opposingCars) {
      if (oc.hit) continue;
      const roadWidthAtY = this._roadWidthAt(oc.y);
      const ocx = W / 2 + oc.x * roadWidthAtY * 0.45;
      // حجم نسبي مع البعد
      const scale = Math.max(0.35, oc.y / H);
      this._drawOpposingCar(ocx, oc.y, oc.color, scale);
    }

    // رسم السيارة
    const carX = W / 2 + this.car.x * roadW;
    const carY = H - this.car.height - 20;
    this._drawCar(carX, carY);
  }

  _drawTree(x, y, size, scale = 1) {
    const ctx = this.ctx;
    const treeWidth = size * scale;
    const trunkHeight = 18 * scale;
    ctx.fillStyle = '#6B4423';
    ctx.fillRect(x - treeWidth * 0.08, y - trunkHeight, treeWidth * 0.16, trunkHeight);
    ctx.fillStyle = '#2D6B2A';
    ctx.beginPath();
    ctx.ellipse(x, y - trunkHeight - treeWidth * 0.3, treeWidth * 0.45, treeWidth * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3F8B3D';
    ctx.beginPath();
    ctx.ellipse(x - treeWidth * 0.18, y - trunkHeight - treeWidth * 0.4, treeWidth * 0.28, treeWidth * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + treeWidth * 0.18, y - trunkHeight - treeWidth * 0.4, treeWidth * 0.28, treeWidth * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawCar(x, y) {
    const ctx = this.ctx;
    const w = this.car.width;
    const h = this.car.height;
    const baseY = y + h * 0.1;

    // ظل السيارة
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x, baseY + h * 0.65, w * 0.48, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // رسم السيارة (رسم جميل دائماً)
    const bodyGradient = ctx.createLinearGradient(0, baseY - h * 0.2, 0, baseY + h);
    bodyGradient.addColorStop(0, '#fff567');
    bodyGradient.addColorStop(1, '#d7ae14');
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, baseY);
    ctx.lineTo(x + w / 2, baseY);
    ctx.lineTo(x + w / 2 - 8, baseY + h);
    ctx.lineTo(x - w / 2 + 8, baseY + h);
    ctx.closePath();
    ctx.fill();

    const roofW = w * 0.65;
    const roofH = h * 0.55 * 0.45;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.moveTo(x - roofW / 2, baseY + roofH * 0.2);
    ctx.lineTo(x + roofW / 2, baseY + roofH * 0.2);
    ctx.lineTo(x + roofW / 2 - 6, baseY + roofH + roofH * 0.1);
    ctx.lineTo(x - roofW / 2 + 6, baseY + roofH + roofH * 0.1);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(52,152,219,0.85)';
    ctx.beginPath();
    ctx.moveTo(x - roofW / 2 + 8, baseY + roofH * 0.25);
    ctx.lineTo(x + roofW / 2 - 8, baseY + roofH * 0.25);
    ctx.lineTo(x + roofW / 2 - 12, baseY + roofH + roofH * 0.05);
    ctx.lineTo(x - roofW / 2 + 12, baseY + roofH + roofH * 0.05);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#1A1A2E';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(x - w / 2 + 12, baseY + h * 0.35, w * 0.25, h * 0.16);
    ctx.fillRect(x + w / 2 - 12 - w * 0.25, baseY + h * 0.35, w * 0.25, h * 0.16);

    const wheelW = w * 0.16;
    const wheelH = wheelW * 0.8;
    ctx.fillStyle = '#1A1A2E';
    ctx.beginPath();
    ctx.ellipse(x - w * 0.34, baseY + h + wheelH * 0.4, wheelW, wheelH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + w * 0.34, baseY + h + wheelH * 0.4, wheelW, wheelH, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1A1A2E';
    ctx.font = 'bold 10px Cairo, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TAXI', x, baseY + h * 0.6);
  }

  _drawOpposingCar(x, y, color, scale = 1) {
    const ctx = this.ctx;
    const w = this.car.width * scale;
    const h = this.car.height * scale;
    const baseY = y - h * 0.3;

    // ظل
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, baseY + h * 0.95, w * 0.45, 8 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // جسم السيارة (مقلوب — هذي قادمة باتجاه اللاعب فأسفلها واسع وأعلاها ضيق)
    const bodyGrad = ctx.createLinearGradient(0, baseY, 0, baseY + h);
    bodyGrad.addColorStop(0, color.body);
    bodyGrad.addColorStop(1, color.dark);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    // شكل مقلوب: السيارة قادمة فالأمام (أسفل) واسع وعريض، الخلف (أعلى) ضيّق
    ctx.moveTo(x - w / 2 + 6, baseY);
    ctx.lineTo(x + w / 2 - 6, baseY);
    ctx.lineTo(x + w / 2, baseY + h);
    ctx.lineTo(x - w / 2, baseY + h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1A1A2E';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // الزجاج الأمامي (في أسفل السيارة لأنها قادمة)
    const windshieldH = h * 0.3;
    ctx.fillStyle = 'rgba(40,60,90,0.85)';
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + 8, baseY + h * 0.55);
    ctx.lineTo(x + w / 2 - 8, baseY + h * 0.55);
    ctx.lineTo(x + w / 2 - 4, baseY + h * 0.55 + windshieldH);
    ctx.lineTo(x - w / 2 + 4, baseY + h * 0.55 + windshieldH);
    ctx.closePath();
    ctx.fill();

    // مصابيح أمامية (أصفر فاقع)
    const headlightSize = w * 0.13;
    ctx.fillStyle = '#FFF8DC';
    ctx.beginPath();
    ctx.ellipse(x - w * 0.32, baseY + h * 0.92, headlightSize, headlightSize * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + w * 0.32, baseY + h * 0.92, headlightSize, headlightSize * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    // وهج المصابيح
    const glow = ctx.createRadialGradient(x - w * 0.32, baseY + h * 0.92, 0, x - w * 0.32, baseY + h * 0.92, headlightSize * 2.5);
    glow.addColorStop(0, 'rgba(255,255,200,0.5)');
    glow.addColorStop(1, 'rgba(255,255,200,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x - w * 0.32, baseY + h * 0.92, headlightSize * 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + w * 0.32, baseY + h * 0.92, headlightSize * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // عجلات (تظهر من الأطراف)
    const wheelW = w * 0.13;
    const wheelH = wheelW * 0.7;
    ctx.fillStyle = '#1A1A2E';
    ctx.beginPath();
    ctx.ellipse(x - w * 0.42, baseY + h * 0.3, wheelW, wheelH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + w * 0.42, baseY + h * 0.3, wheelW, wheelH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - w * 0.42, baseY + h * 0.85, wheelW, wheelH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + w * 0.42, baseY + h * 0.85, wheelW, wheelH, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawItem(x, y, type, baseSize = 20) {
    const ctx = this.ctx;
    const size = baseSize * (0.65 + 0.35 * (1 - y / this.H));
    if (type === 'post') {
      ctx.fillStyle = '#2f2f2f';
      ctx.beginPath();
      ctx.moveTo(x - size * 0.5, y - size * 0.6);
      ctx.lineTo(x + size * 0.5, y - size * 0.6);
      ctx.lineTo(x + size * 0.4, y + size * 0.2);
      ctx.lineTo(x - size * 0.4, y + size * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffd523';
      ctx.fillRect(x - size * 0.5, y - size * 0.55, size, size * 0.35);
      ctx.fillStyle = '#1A1A2E';
      ctx.font = `bold ${Math.round(size * 0.4)}px Cairo, Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('بوست', x, y - size * 0.25);
    } else if (type === 'x2') {
      ctx.fillStyle = 'rgba(255,215,0,0.95)';
      ctx.beginPath();
      ctx.ellipse(x, y, size, size * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e08d00';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#1A1A2E';
      ctx.font = `bold ${Math.round(size * 0.6)}px Cairo, Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('x2', x, y + 1);
    }
  }
}
