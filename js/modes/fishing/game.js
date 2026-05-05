// ===== صيد الأحرف 🎣 (نسخة الشبكة) =====
import { saveLetterToStock, spendLetters, getStock } from '../../core/storage.js';
import { awardLetter } from '../../core/rare-letters.js';
import { recordLetter } from '../../core/lifetime-storage.js';
import { playSplashSound, playCollectSound, playLoseLifeSound, playWinSound } from '../../core/audio.js';
import { recordPlayStart, recordPlayEnd } from '../../core/game-stats.js';

const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';

// ===== أصول الصور =====
const ASSETS_PATH = 'assets/fishing/';
const FISH_FILES = [
  // facesRight: العين على اليمين (السمك متوجه يمين بطبيعة الصورة)
  // facesRight = false → السمك متوجه يسار (نقلب الصورة لما يتحرك يمين)
  { src: 'fish-1.png', facesRight: false, special: false },
  { src: 'fish-2.png', facesRight: true,  special: 'octopus' }, // أخطبوط/محار 45° — يتحرك ببطء، ما ينقلب
  { src: 'fish-3.png', facesRight: false, special: false },
  { src: 'fish-4.png', facesRight: true,  special: false },
  { src: 'fish-6.png', facesRight: true,  special: false },
  { src: 'fish-8.png', facesRight: true,  special: false },
];

function loadImage(src) {
  const img = new Image();
  img.src = ASSETS_PATH + src;
  return img;
}

const ASSETS = {
  boat:    loadImage('boat.png'),
  net:     loadImage('net.png'),
  bobber:  loadImage('bobber.png'),
  sun:     loadImage('sun.png'),
  cloud1:  loadImage('cloud-1.png'),
  cloud2:  loadImage('cloud-2.png'),
  wave1:   loadImage('wave-1.png'),
  fish:    FISH_FILES.map(f => ({ ...f, img: loadImage(f.src) })),
};

function isImgReady(img) {
  return img && img.complete && img.naturalHeight > 0;
}

// حالات الشبكة
const NET_IDLE = 'idle';        // في القارب
const NET_CASTING = 'casting';  // تنزل
const NET_WAITING = 'waiting';  // تنتظر السمك في القاع
const NET_BITE = 'bite';        // طُعم! انتفاضة
const NET_PULLING = 'pulling';  // يسحب الشبكة
const NET_SHOWING = 'showing';  // يعرض النتيجة

const GAME_DURATION = 90; // ثانية - أطول لأن كل قذفة تأخذ وقت

export class FishingGame {
  constructor(onExit) {
    this.onExit = onExit;
    this.canvas = document.getElementById('fishing-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.W = 0;
    this.H = 0;

    this.fish = [];
    this.bubbles = [];
    this.clouds = [];
    this.ripples = [];

    this.net = {
      x: 0,
      y: 0,
      targetY: 0,
      state: NET_IDLE,
      shake: 0,         // قوة الانتفاضة (للأنميشن عند الطُعم)
      waitTimer: 0,     // عد تنازلي للطُعم
      biteTimer: 0,     // عد تنازلي للسحب
      pullSpeed: 4,
      result: null,     // النتيجة بعد السحب
    };

    // حركة القارب الجانبية
    this.boatX = 0;     // -1 إلى 1
    this.boatTargetX = 0;
    this.boatVx = 0;

    this.score = 0;
    this.timeLeft = GAME_DURATION;
    this.timer = null;
    this.running = false;
    this.paused = false;
    this.t = 0;

    this.statusText = '';

    this._setupListeners();
  }

  _setupListeners() {
    document.getElementById('fishing-btn-pause').onclick = () => this.pause();
    document.getElementById('fishing-btn-resume').onclick = () => this.resume();
    document.getElementById('fishing-btn-quit-pause').onclick = () => this.quit();
    document.getElementById('fishing-btn-restart').onclick = () => this.restart();
    document.getElementById('fishing-btn-quit-gameover').onclick = () => this.quit();

    this.canvas.addEventListener('click', (e) => this._onTap(e));
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this._onTapAt(touch.clientX, touch.clientY);
    }, { passive: false });

    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.W = rect.width;
    this.H = rect.height;
  }

  _onTap(e) {
    if (!this.running || this.paused) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this._onTapAt(x, y);
  }

  _onTapAt(x, y) {
    if (!this.running || this.paused) return;

    // إذا الشبكة في الـ idle → ارمها
    if (this.net.state === NET_IDLE) {
      this._castNet(x, y);
    }
    // إذا في حالة طُعم → اسحب الشبكة بسرعة
    else if (this.net.state === NET_BITE) {
      this._startPulling();
    }
    // إذا تعرض نتيجة → اضغط لإغلاقها
    else if (this.net.state === NET_SHOWING) {
      this.net.state = NET_IDLE;
      this.net.result = null;
      this.statusText = '';
    }
    // أثناء WAITING يتجاهل النقرات
  }

  _castNet(x, y) {
    const seaY = this.H * 0.32;
    const targetY = Math.min(Math.max(y, seaY + 80), this.H * 0.88);

    // حدد إلى أين يذهب القارب
    this.boatTargetX = ((x / this.W) - 0.5) * 1.6; // -0.8 إلى 0.8
    this.net.x = x;
    this.net.targetY = targetY;
    this.net.y = seaY - 20;
    this.net.state = NET_CASTING;
    this.net.shake = 0;
    this.net.result = null;
    document.getElementById('fishing-instructions').classList.add('hidden');
    playSplashSound();

    // فقاعات عند الرمي
    for (let i = 0; i < 6; i++) {
      this._addBubble(this.net.x, seaY + 12);
    }
    this._addRipple(this.net.x, seaY + 12);
  }

  _startBiteWait() {
    this.net.state = NET_WAITING;
    // وقت عشوائي 2-7 ثوانٍ
    this.net.waitTimer = 120 + Math.random() * 300;  // فريم ≈ 60fps
    this.statusText = '⏳ في انتظار السمك...';
  }

  _triggerBite() {
    this.net.state = NET_BITE;
    this.net.shake = 0;
    this.net.biteTimer = 240; // 4 ثوان للسحب وإلا تختفي السمكة
    this.statusText = '🐟 طُعم! اسحب الآن!';
    playSplashSound();
  }

  _startPulling() {
    this.net.state = NET_PULLING;
    // احسب النتيجة
    this.net.result = this._rollResult();
    this.statusText = '⚓ نسحب الشبكة...';
  }

  _showResult() {
    this.net.state = NET_SHOWING;
    const r = this.net.result;
    if (!r) {
      this.statusText = '🌊 الشبكة فارغة!';
      return;
    }
    if (r.type === 'loss') {
      this.statusText = `💸 وقعت أحرف من الشبكة! خسرت ${r.lossCount}`;
      playLoseLifeSound();
      return;
    }

    // إجمالي الأحرف
    let total = 0;
    let parts = [];
    for (const [char, count] of Object.entries(r.letters)) {
      total += count;
      parts.push(`${count}× ${char}`);
    }
    this.score += total;
    this._updateHUD();

    if (r.type === 'big') {
      this.statusText = `🎉 صيد كبير! ${parts.join(' + ')}`;
      playWinSound();
    } else if (r.type === 'medium') {
      this.statusText = `🐠 صيد جيد: ${parts.join(' + ')}`;
      playCollectSound();
    } else {
      this.statusText = `🐟 صيد: ${parts.join(' + ')}`;
      playCollectSound();
    }
  }

  // ===== خوارزمية النتيجة العشوائية =====
  _rollResult() {
    const r = Math.random();

    // 5% خسارة
    if (r < 0.05) {
      return this._lossResult();
    }
    // 8% فارغ
    if (r < 0.13) {
      return null;
    }
    // 8% صيد كبير
    if (r < 0.21) {
      return this._bigPack();
    }
    // 32% صيد متوسط
    if (r < 0.53) {
      return this._mediumPack();
    }
    // 47% صيد عادي
    return this._smallPack();
  }

  _smallPack() {
    // 2-4 أحرف من نوع واحد
    const char = ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
    const count = 2 + Math.floor(Math.random() * 3);
    this._awardLetters({ [char]: count });
    return { type: 'small', letters: { [char]: count } };
  }

  _mediumPack() {
    // 5-9 أحرف من 2-3 أنواع
    const types = 2 + Math.floor(Math.random() * 2);
    const letters = {};
    let total = 0;
    const target = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < types; i++) {
      const c = ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
      const n = i === types - 1 ? target - total : 1 + Math.floor(Math.random() * 3);
      letters[c] = (letters[c] || 0) + n;
      total += n;
    }
    this._awardLetters(letters);
    return { type: 'medium', letters };
  }

  _bigPack() {
    // 10-18 أحرف من 3-5 أنواع
    const types = 3 + Math.floor(Math.random() * 3);
    const letters = {};
    let total = 0;
    const target = 10 + Math.floor(Math.random() * 9);
    for (let i = 0; i < types; i++) {
      const c = ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
      const n = i === types - 1 ? target - total : 2 + Math.floor(Math.random() * 4);
      letters[c] = (letters[c] || 0) + n;
      total += n;
    }
    this._awardLetters(letters);
    return { type: 'big', letters };
  }

  _lossResult() {
    // اخسر 2-5 أحرف من المخزن (إن وجدت)
    const stock = getStock();
    const owned = Object.entries(stock).filter(([, n]) => n > 0);
    if (owned.length === 0) {
      return null; // ما عندو شي ليخسر، يطلع فارغ
    }
    let toLose = 2 + Math.floor(Math.random() * 4);
    const cost = {};
    while (toLose > 0 && owned.length > 0) {
      const idx = Math.floor(Math.random() * owned.length);
      const [c, n] = owned[idx];
      if (n <= 0) { owned.splice(idx, 1); continue; }
      cost[c] = (cost[c] || 0) + 1;
      owned[idx][1]--;
      toLose--;
    }
    spendLetters(cost);
    return { type: 'loss', lossCount: Object.values(cost).reduce((s, n) => s + n, 0), letters: cost };
  }

  _awardLetters(letters) {
    for (const [char, count] of Object.entries(letters)) {
      const r = awardLetter('fishing', char, count);
      this._lettersCollectedThisRun = (this._lettersCollectedThisRun || 0) + r.count;
    }
  }

  start() {
    requestAnimationFrame(() => {
      this._resize();
      if (this.W === 0 || this.H === 0) {
        requestAnimationFrame(() => this._actuallyStart());
      } else {
        this._actuallyStart();
      }
    });
  }

  _actuallyStart() {
    this._resize();
    this.score = 0;
    this.timeLeft = GAME_DURATION;
    this.fish = [];
    this.bubbles = [];
    this.clouds = [];
    this.ripples = [];
    this.boatX = 0;
    this.boatTargetX = 0;
    this.boatVx = 0;
    this.net.state = NET_IDLE;
    this.net.result = null;
    this.statusText = '';
    this.t = 0;

    for (let i = 0; i < 4; i++) {
      this.clouds.push({
        variant: Math.random() < 0.5 ? 1 : 2,
        x: Math.random() * this.W,
        y: this.H * 0.05 + Math.random() * this.H * 0.18,
        size: 80 + Math.random() * 60,
        speed: 0.15 + Math.random() * 0.2,
      });
    }

    // أسماك زينة فقط (للديكور)
    for (let i = 0; i < 6; i++) {
      this._spawnDecorFish();
    }

    document.getElementById('fishing-overlay-pause').hidden = true;
    document.getElementById('fishing-overlay-gameover').hidden = true;
    document.getElementById('fishing-instructions').classList.remove('hidden');
    document.getElementById('fishing-instructions').textContent = 'اضغط في أي مكان لوضع الصنارة';
    this._updateHUD();

    this.running = true;
    this.paused = false;
    this._lettersCollectedThisRun = 0;
    recordPlayStart('fishing');
    this._startTimer();
    this._loop();
  }

  pause() {
    if (!this.running) return;
    this.paused = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    document.getElementById('fishing-overlay-pause').hidden = false;
  }

  resume() {
    this.paused = false;
    document.getElementById('fishing-overlay-pause').hidden = true;
    this._startTimer();
    this._loop();
  }

  quit() {
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    document.getElementById('fishing-overlay-pause').hidden = true;
    document.getElementById('fishing-overlay-gameover').hidden = true;
    this.onExit();
  }

  restart() {
    document.getElementById('fishing-overlay-gameover').hidden = true;
    this.start();
  }

  _startTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.timeLeft--;
      this._updateHUD();
      if (this.timeLeft <= 0) this._gameOver();
    }, 1000);
  }

  _gameOver() {
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    recordPlayEnd('fishing', {
      score: this.score,
      lettersCollected: this._lettersCollectedThisRun || 0,
      won: false,
    });
    document.getElementById('fishing-final-score').textContent = this.score;
    document.getElementById('fishing-overlay-gameover').hidden = false;
  }

  _updateHUD() {
    document.getElementById('fishing-time').textContent = this.timeLeft;
    document.getElementById('fishing-score-value').textContent = this.score;
  }

  _spawnDecorFish() {
    const seaTop = this.H * 0.40;
    const seaBottom = this.H * 0.95;
    const fromLeft = Math.random() < 0.5;
    const fishDef = ASSETS.fish[Math.floor(Math.random() * ASSETS.fish.length)];
    const isOctopus = fishDef.special === 'octopus';
    this.fish.push({
      def: fishDef,
      x: fromLeft ? -60 : this.W + 60,
      y: isOctopus
        ? seaTop + (seaBottom - seaTop) * (0.55 + Math.random() * 0.4)  // أخطبوط/محار بالأعماق
        : seaTop + Math.random() * (seaBottom - seaTop),
      vx: isOctopus
        ? (fromLeft ? 1 : -1) * 0.25
        : (fromLeft ? 1 : -1) * (0.6 + Math.random() * 1.2),
      vy: isOctopus ? -0.15 - Math.random() * 0.15 : 0,  // الأخطبوط يطلع بطيء للأعلى
      bob: Math.random() * Math.PI * 2,
      bobSpeed: 0.03 + Math.random() * 0.025,
      size: isOctopus ? 50 + Math.random() * 14 : 38 + Math.random() * 18,
    });
  }

  _addBubble(x, y) {
    this.bubbles.push({
      x: x + (Math.random() - 0.5) * 20,
      y, size: 3 + Math.random() * 5,
      vy: -1 - Math.random() * 1.5,
      alpha: 0.6 + Math.random() * 0.3,
    });
  }

  _addRipple(x, y) {
    this.ripples.push({
      x, y, r: 5, maxR: 35, alpha: 1,
    });
  }

  _boatY() {
    return this.H * 0.32 - 12 + Math.sin(this.t * 0.04) * 1.5;
  }
  _boatScreenX() {
    return this.W * 0.5 + this.boatX * (this.W * 0.4);
  }

  _loop = () => {
    if (!this.running || this.paused) return;
    try {
      this._update();
      this._draw();
    } catch (e) {
      console.error('Fishing loop error:', e);
    }
    requestAnimationFrame(this._loop);
  };

  _update() {
    this.t++;

    // تحريك القارب نحو الهدف
    const dx = this.boatTargetX - this.boatX;
    this.boatX += dx * 0.03;

    // غيوم
    for (const c of this.clouds) {
      c.x -= c.speed;
      if (c.x < -c.size * 2) c.x = this.W + c.size;
    }

    // أسماك زينة
    const seaTop = this.H * 0.40;
    for (const f of this.fish) {
      f.x += f.vx;
      f.bob += f.bobSpeed;
      f.y += Math.sin(f.bob) * 0.3 + (f.vy || 0);
    }
    this.fish = this.fish.filter(f =>
      f.x > -150 && f.x < this.W + 150 && f.y > seaTop - 20
    );
    if (this.fish.length < 6) this._spawnDecorFish();

    // فقاعات
    if (Math.random() < 0.06) {
      this._addBubble(Math.random() * this.W, this.H * 0.4 + Math.random() * this.H * 0.5);
    }
    for (const b of this.bubbles) {
      b.y += b.vy;
      b.alpha -= 0.005;
    }
    this.bubbles = this.bubbles.filter(b => b.alpha > 0 && b.y > this.H * 0.32);

    // موجات دائرية
    for (const r of this.ripples) {
      r.r += 1;
      r.alpha -= 0.025;
    }
    this.ripples = this.ripples.filter(r => r.alpha > 0);

    // ===== منطق الشبكة =====
    if (this.net.state === NET_CASTING) {
      this.net.y += 7;
      if (this.net.y >= this.net.targetY) {
        this.net.y = this.net.targetY;
        this._startBiteWait();
      }
    } else if (this.net.state === NET_WAITING) {
      this.net.waitTimer--;
      if (this.net.waitTimer <= 0) {
        this._triggerBite();
      }
    } else if (this.net.state === NET_BITE) {
      this.net.shake = Math.sin(this.t * 0.6) * 4;
      this.net.biteTimer--;
      if (this.net.biteTimer <= 0) {
        // لم يسحب → سحب تلقائي بنتيجة فارغة
        this.net.result = null;
        this._startPulling();
      }
    } else if (this.net.state === NET_PULLING) {
      this.net.y -= this.net.pullSpeed;
      this.net.shake *= 0.92;
      const targetY = this._boatY() + 25;
      if (this.net.y <= targetY) {
        this.net.y = targetY;
        this._showResult();
      }
    }
  }

  _draw() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    const seaY = H * 0.32;

    // ===== السماء =====
    const sky = ctx.createLinearGradient(0, 0, 0, seaY);
    sky.addColorStop(0,    '#FF7E5F');
    sky.addColorStop(0.4,  '#FEB47B');
    sky.addColorStop(0.75, '#86A8E7');
    sky.addColorStop(1,    '#91EAE4');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, seaY);

    // الشمس
    const sunX = W * 0.78, sunY = H * 0.13;
    if (isImgReady(ASSETS.sun)) {
      const sw = 130;
      const sh = sw * (ASSETS.sun.naturalHeight / ASSETS.sun.naturalWidth);
      ctx.drawImage(ASSETS.sun, sunX - sw / 2, sunY - sh / 2, sw, sh);
    } else {
      const sunGrad = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 50);
      sunGrad.addColorStop(0, '#FFF3B0');
      sunGrad.addColorStop(0.6, '#FFCC33');
      sunGrad.addColorStop(1, 'rgba(255,200,50,0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFF8DC';
      ctx.beginPath();
      ctx.arc(sunX, sunY, 22, 0, Math.PI * 2);
      ctx.fill();
    }

    // الغيوم
    for (const c of this.clouds) {
      this._drawCloud(c);
    }

    // ===== البحر =====
    const sea = ctx.createLinearGradient(0, seaY, 0, H);
    sea.addColorStop(0,    '#2EC8B5');
    sea.addColorStop(0.25, '#1B9AA8');
    sea.addColorStop(0.6,  '#0E5C7A');
    sea.addColorStop(1,    '#062A40');
    ctx.fillStyle = sea;
    ctx.fillRect(0, seaY, W, H - seaY);

    // أشعة شمس داخل الماء
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#FFF3B0';
    for (let i = 0; i < 5; i++) {
      const x = (W / 5) * i + W / 10 + Math.sin(this.t / 60 + i) * 20;
      ctx.beginPath();
      ctx.moveTo(x - 30, seaY);
      ctx.lineTo(x + 30, seaY);
      ctx.lineTo(x + 80, H * 0.95);
      ctx.lineTo(x - 80, H * 0.95);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // الأسماك الزينة
    for (const f of this.fish) {
      this._drawFish(f);
    }

    // الفقاعات
    for (const b of this.bubbles) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(200,240,255,${b.alpha * 0.5})`;
      ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${b.alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ===== الأمواج — صورة wave-1.png تتمرر =====
    ctx.save();
    if (isImgReady(ASSETS.wave1)) {
      const tileW = 180;
      const tileH = tileW * (ASSETS.wave1.naturalHeight / ASSETS.wave1.naturalWidth);
      // الموجة الأمامية — متحركة أسرع وأبرز
      const off1 = (this.t * 1.4) % tileW;
      ctx.globalAlpha = 0.95;
      for (let x = -off1; x < W + tileW; x += tileW) {
        ctx.drawImage(ASSETS.wave1, x, seaY - tileH * 0.55, tileW, tileH);
      }
      // طبقة خلفية أبطأ (موجة بعيدة) — شفافة أكثر
      const tileW2 = 130;
      const tileH2 = tileW2 * (ASSETS.wave1.naturalHeight / ASSETS.wave1.naturalWidth);
      const off2 = (this.t * 0.7) % tileW2;
      ctx.globalAlpha = 0.55;
      for (let x = -off2; x < W + tileW2; x += tileW2) {
        ctx.drawImage(ASSETS.wave1, x + 30, seaY - tileH2 * 0.4, tileW2, tileH2);
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const wave1Off = (this.t * 1.5) % 60;
      for (let x = -wave1Off; x < W; x += 60) {
        ctx.moveTo(x, seaY);
        ctx.quadraticCurveTo(x + 30, seaY - 8, x + 60, seaY);
      }
      ctx.stroke();
    }
    ctx.restore();

    // موجات دائرية
    for (const r of this.ripples) {
      ctx.strokeStyle = `rgba(255,255,255,${r.alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ===== القارب — يطفو على البحر =====
    this._drawBoat(this._boatScreenX(), this._boatY());

    // ===== الشبكة =====
    if (this.net.state !== NET_IDLE) {
      this._drawNet();
    }

    // ===== شريط الحالة =====
    if (this.statusText && this.net.state !== NET_SHOWING) {
      this._drawStatus(this.statusText);
    }

    // ===== لوحة نتيجة الصيد (تظهر فقط عند SHOWING) =====
    if (this.net.state === NET_SHOWING) {
      this._drawCatchPanel();
    }
  }

  _drawCatchPanel() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    const r = this.net.result;

    // بانر العنوان حسب النوع
    let title = '';
    let titleColor = '#FFD700';
    let isLoss = false;

    if (!r) {
      title = '🌊 الشبكة فارغة';
      titleColor = '#9eb0c2';
    } else if (r.type === 'loss') {
      title = '💸 وقعت أحرف!';
      titleColor = '#FF6B6B';
      isLoss = true;
    } else if (r.type === 'big')    title = '🎉 صيد كبير!';
    else if (r.type === 'medium')   title = '🐠 صيد جيد';
    else                            title = '🐟 صيد';

    const letterEntries = (r && r.letters) ? Object.entries(r.letters) : [];
    const totalLetters = letterEntries.reduce((s, [, n]) => s + n, 0);

    // أبعاد اللوحة
    const chipSize = Math.min(72, W * 0.16);
    const chipsPerRow = Math.min(letterEntries.length || 1, Math.floor((W * 0.85) / (chipSize + 12)));
    const rows = Math.max(1, Math.ceil((letterEntries.length || 1) / chipsPerRow));
    const panelW = Math.min(W * 0.9, Math.max(280, chipsPerRow * (chipSize + 12) + 32));
    const panelH = 70 + (letterEntries.length > 0 ? rows * (chipSize + 14) + 20 : 30) + 40;
    const panelX = (W - panelW) / 2;
    const panelY = H * 0.18;

    // خلفية اللوحة
    ctx.save();
    ctx.fillStyle = 'rgba(8, 22, 40, 0.92)';
    this._drawRoundRect(panelX, panelY, panelW, panelH, 18);
    ctx.fill();
    ctx.strokeStyle = isLoss ? 'rgba(255,107,107,0.6)' : 'rgba(255,215,0,0.55)';
    ctx.lineWidth = 2;
    this._drawRoundRect(panelX, panelY, panelW, panelH, 18);
    ctx.stroke();

    // العنوان
    ctx.fillStyle = titleColor;
    ctx.font = `bold ${Math.round(panelW * 0.06)}px Cairo, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, W / 2, panelY + 32);

    // الرقاقات (chips)
    if (letterEntries.length > 0) {
      const startY = panelY + 70;
      let i = 0;
      for (const [char, count] of letterEntries) {
        const col = i % chipsPerRow;
        const row = Math.floor(i / chipsPerRow);
        const totalRowWidth = chipsPerRow * (chipSize + 12) - 12;
        const rowStartX = (W - totalRowWidth) / 2;
        const cx = rowStartX + col * (chipSize + 12);
        const cy = startY + row * (chipSize + 14);

        // خلفية الرقاقة
        const grad = ctx.createLinearGradient(cx, cy, cx, cy + chipSize);
        if (isLoss) {
          grad.addColorStop(0, 'rgba(255,107,107,0.20)');
          grad.addColorStop(1, 'rgba(140,30,30,0.20)');
        } else {
          grad.addColorStop(0, 'rgba(255,215,0,0.20)');
          grad.addColorStop(1, 'rgba(180,140,0,0.10)');
        }
        ctx.fillStyle = grad;
        this._drawRoundRect(cx, cy, chipSize, chipSize, 12);
        ctx.fill();
        ctx.strokeStyle = isLoss ? 'rgba(255,107,107,0.5)' : 'rgba(255,215,0,0.45)';
        ctx.lineWidth = 1.5;
        this._drawRoundRect(cx, cy, chipSize, chipSize, 12);
        ctx.stroke();

        // الحرف الكبير
        ctx.fillStyle = isLoss ? '#FFB0B0' : '#FFD700';
        ctx.font = `bold ${Math.round(chipSize * 0.55)}px Cairo, Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char, cx + chipSize / 2, cy + chipSize * 0.42);

        // العدد ×n
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.round(chipSize * 0.22)}px Cairo, Arial`;
        ctx.fillText(`×${count}`, cx + chipSize / 2, cy + chipSize * 0.82);

        i++;
      }

      // الإجمالي
      ctx.fillStyle = isLoss ? '#FF8080' : '#FFFFFF';
      ctx.font = `bold ${Math.round(panelW * 0.045)}px Cairo, Arial`;
      ctx.fillText(
        isLoss ? `الإجمالي المفقود: ${totalLetters}` : `الإجمالي المربوح: ${totalLetters}`,
        W / 2, panelY + panelH - 30
      );
    }

    // تلميح للإغلاق
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `${Math.round(panelW * 0.035)}px Cairo, Arial`;
    ctx.fillText('انقر للمتابعة', W / 2, panelY + panelH - 10);
    ctx.restore();
  }

  _drawRoundRect(x, y, w, h, radius) {
    // بديل متوافق لـ ctx.roundRect (لا يدعمه Safari القديم)
    const ctx = this.ctx;
    const r = Math.min(radius, h / 2, w / 2);
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

  _drawStatus(text) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = 'bold 18px Cairo, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const padding = 14;
    const metrics = ctx.measureText(text);
    const w = metrics.width + padding * 2;
    const h = 36;
    const x = this.W / 2 - w / 2;
    const y = this.H * 0.05;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    this._drawRoundRect(x, y, w, h, 18);
    ctx.fill();
    ctx.fillStyle = '#FFD700';
    ctx.fillText(text, this.W / 2, y + h / 2);
    ctx.restore();
  }

  _drawCloud(c) {
    const ctx = this.ctx;
    const img = c.variant === 2 ? ASSETS.cloud2 : ASSETS.cloud1;
    if (isImgReady(img)) {
      const w = c.size * 1.6;
      const h = w * (img.naturalHeight / img.naturalWidth);
      ctx.drawImage(img, c.x, c.y - h / 2, w, h);
    } else {
      // احتياطي
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(c.x + c.size * 0.5, c.y, c.size * 0.45, 0, Math.PI * 2);
      ctx.arc(c.x + c.size * 0.9, c.y, c.size * 0.5, 0, Math.PI * 2);
      ctx.arc(c.x + c.size * 1.2, c.y + c.size * 0.1, c.size * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawBoat(x, y) {
    const ctx = this.ctx;
    const seaY = this.H * 0.32;
    const img = ASSETS.boat;
    if (!isImgReady(img)) return;

    // الحجم: عرض ثابت ~220 بكسل، الارتفاع يتبع نسبة الصورة الأصلية
    const w = 220;
    const h = w * (img.naturalHeight / img.naturalWidth);

    ctx.save();

    // ظل خفيف على الماء تحت القارب
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x, seaY + 16, w * 0.42, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // ارسم القارب بحيث يكون ثلثه السفلي تحت الماء (يعطي إحساس طفو)
    const drawX = x - w / 2;
    const drawY = seaY - h * 0.78;
    ctx.drawImage(img, drawX, drawY, w, h);

    ctx.restore();
  }

  _drawNet() {
    const ctx = this.ctx;
    const seaY = this.H * 0.32;
    const x = this.net.x + this.net.shake;
    const y = this.net.y;
    const boatX = this._boatScreenX();
    const boatY = this._boatY();

    const netImg = ASSETS.net;
    const bobImg = ASSETS.bobber;

    // قياسات الشبكة
    const netW = 110;
    const netH = isImgReady(netImg)
      ? netW * (netImg.naturalHeight / netImg.naturalWidth)
      : 130;

    // مرتكز ربط الخيط (أعلى الشبكة)
    const netTopY = y - netH * 0.45;

    ctx.save();

    // ===== الخيط من القارب إلى سطح الماء (عند الـ bobber) ثم تحت الماء للشبكة =====
    const lineColor = 'rgba(255,255,255,0.85)';
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(boatX + 30, boatY - 35);   // طرف العصا تقريباً
    ctx.lineTo(x, seaY + 6);              // نقطة دخول الخيط الماء (عند العوامة)
    ctx.lineTo(x, netTopY);               // الخيط تحت الماء للشبكة
    ctx.stroke();

    // ===== العوامة (bobber) على سطح الماء — تتموج خفيف =====
    if (this.net.state !== NET_IDLE && isImgReady(bobImg)) {
      const bobW = 28;
      const bobH = bobW * (bobImg.naturalHeight / bobImg.naturalWidth);
      const bobBob = Math.sin(this.t * 0.08) * 2 + (this.net.state === NET_BITE ? Math.sin(this.t * 0.7) * 4 : 0);
      ctx.drawImage(bobImg, x - bobW / 2, seaY - bobH * 0.7 + bobBob, bobW, bobH);
    }

    // ===== الشبكة =====
    if (isImgReady(netImg)) {
      // اهتزاز عند الطُعم
      const shakeY = this.net.state === NET_BITE ? Math.sin(this.t * 0.8) * 3 : 0;
      ctx.drawImage(netImg, x - netW / 2, y - netH * 0.45 + shakeY, netW, netH);
    } else {
      // احتياطي بسيط لو الصورة ما تحمّلت
      ctx.fillStyle = 'rgba(60, 80, 95, 0.4)';
      ctx.beginPath();
      ctx.ellipse(x, y, netW * 0.4, netH * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ===== مؤشرات الحالة فوق الشبكة =====
    if (this.net.state === NET_BITE) {
      ctx.font = 'bold 22px Cairo, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 5;
      ctx.fillStyle = '#FFD700';
      ctx.fillText('🐟', x, y + netH * 0.1);
      ctx.shadowBlur = 0;
    }

    if ((this.net.state === NET_PULLING || this.net.state === NET_SHOWING)
        && this.net.result && this.net.result.letters && this.net.result.type !== 'loss') {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 22px Cairo, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 5;
      ctx.fillText('✨', x, y + netH * 0.1);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  _drawFish(f) {
    const ctx = this.ctx;
    const img = f.def.img;
    if (!isImgReady(img)) return;

    const aspect = img.naturalWidth / img.naturalHeight;
    const w = f.size * 2;
    const h = w / aspect;

    ctx.save();
    ctx.translate(f.x, f.y);

    // الأخطبوط/المحار: ما ينقلب أبداً (رسم بزاوية ثابتة)
    if (f.def.special === 'octopus') {
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
      return;
    }

    // قلب الصورة لو السمكة تتحرك بعكس اتجاه عينيها
    const movingRight = f.vx > 0;
    const needsFlip = movingRight !== f.def.facesRight;
    if (needsFlip) ctx.scale(-1, 1);

    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}
