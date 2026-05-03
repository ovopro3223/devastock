// ===== صيد الأحرف 🎣 (نسخة الشبكة) =====
import { saveLetterToStock, spendLetters, getStock } from '../../core/storage.js';
import { awardLetter } from '../../core/rare-letters.js';
import { recordLetter } from '../../core/lifetime-storage.js';
import { playSplashSound, playCollectSound, playLoseLifeSound, playWinSound } from '../../core/audio.js';
import { recordPlayStart, recordPlayEnd } from '../../core/game-stats.js';

const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';

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

    // تحميل صورة الشبكة
    this.netImage = new Image();
    this.netImage.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Fishing_net.svg/400px-Fishing_net.svg';

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
      for (let i = 0; i < count; i++) {
        const r = awardLetter('fishing', char);
        this._lettersCollectedThisRun = (this._lettersCollectedThisRun || 0) + r.count;
      }
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
        x: Math.random() * this.W,
        y: this.H * 0.05 + Math.random() * this.H * 0.15,
        size: 30 + Math.random() * 30,
        speed: 0.15 + Math.random() * 0.15,
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
    this.fish.push({
      char: ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)],
      x: fromLeft ? -60 : this.W + 60,
      y: seaTop + Math.random() * (seaBottom - seaTop),
      vx: (fromLeft ? 1 : -1) * (0.6 + Math.random() * 1.2),
      bob: Math.random() * Math.PI * 2,
      bobSpeed: 0.04 + Math.random() * 0.03,
      tailPhase: Math.random() * Math.PI,
      size: 18 + Math.random() * 8,
      color: this._fishColor(),
    });
  }

  _fishColor() {
    const colors = ['#E74C3C', '#3498DB', '#9B59B6', '#F39C12', '#1ABC9C', '#E67E22'];
    return colors[Math.floor(Math.random() * colors.length)];
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
    for (const f of this.fish) {
      f.x += f.vx;
      f.bob += f.bobSpeed;
      f.y += Math.sin(f.bob) * 0.3;
      f.tailPhase += 0.25;
    }
    this.fish = this.fish.filter(f => f.x > -120 && f.x < this.W + 120);
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

    // الغيوم
    for (const c of this.clouds) {
      this._drawCloud(c.x, c.y, c.size);
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

    // ===== الأمواج (ترسم فوق ما في الماء قرب السطح) =====
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let wave1Off = (this.t * 1.5) % 60;
    for (let x = -wave1Off; x < W; x += 60) {
      ctx.moveTo(x, seaY);
      ctx.quadraticCurveTo(x + 30, seaY - 8, x + 60, seaY);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let wave2Off = (this.t * 0.8) % 40;
    for (let x = -wave2Off; x < W; x += 40) {
      ctx.moveTo(x, seaY + 3);
      ctx.quadraticCurveTo(x + 20, seaY - 1, x + 40, seaY + 3);
    }
    ctx.stroke();
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

  _drawCloud(x, y, size) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.45, 0, Math.PI * 2);
    ctx.arc(x + size * 0.4, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.7, y + size * 0.1, size * 0.4, 0, Math.PI * 2);
    ctx.arc(x + size * 0.3, y - size * 0.2, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawBoat(x, y) {
    const ctx = this.ctx;
    const seaY = this.H * 0.32;
    ctx.save();

    // ظل القارب على الماء
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(x, seaY + 22, 80, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // ===== هيكل القارب — جزء على السطح، جزء غاطس =====
    // الجزء الغاطس (داخل الماء)
    const submergedGrad = ctx.createLinearGradient(0, seaY, 0, seaY + 28);
    submergedGrad.addColorStop(0, '#5C2C0E');
    submergedGrad.addColorStop(1, '#3E1B07');
    ctx.fillStyle = submergedGrad;
    ctx.beginPath();
    ctx.moveTo(x - 75, seaY);
    ctx.lineTo(x + 75, seaY);
    ctx.quadraticCurveTo(x + 60, seaY + 28, x - 60, seaY + 28);
    ctx.closePath();
    ctx.fill();

    // الجزء فوق الماء (سطح القارب)
    const topGrad = ctx.createLinearGradient(0, y, 0, seaY);
    topGrad.addColorStop(0, '#A0522D');
    topGrad.addColorStop(1, '#7B3F1A');
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.moveTo(x - 75, seaY);
    ctx.lineTo(x + 75, seaY);
    ctx.lineTo(x + 65, y);
    ctx.lineTo(x - 65, y);
    ctx.closePath();
    ctx.fill();

    // ألواح خشبية للتفاصيل
    ctx.strokeStyle = 'rgba(62, 27, 7, 0.5)';
    ctx.lineWidth = 1;
    for (let i = -55; i <= 55; i += 18) {
      ctx.beginPath();
      ctx.moveTo(x + i, y + 2);
      ctx.lineTo(x + i, seaY - 1);
      ctx.stroke();
    }

    // حافة القارب (خط أعلى أبيض)
    ctx.fillStyle = '#3E1B07';
    ctx.fillRect(x - 75, y - 3, 150, 4);
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(x - 73, y - 1, 146, 1);

    // ===== الصياد =====
    // جسم
    ctx.fillStyle = '#3498DB';
    ctx.fillRect(x - 22, y - 18, 14, 16);

    // ذراعين تمسكان بالشبكة
    ctx.strokeStyle = '#F1C27D';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 16, y - 12);
    ctx.lineTo(x + 5, y - 18);
    ctx.stroke();

    // رأس
    ctx.fillStyle = '#F1C27D';
    ctx.beginPath();
    ctx.arc(x - 15, y - 22, 7, 0, Math.PI * 2);
    ctx.fill();

    // قبعة الصياد
    ctx.fillStyle = '#C0392B';
    ctx.fillRect(x - 24, y - 30, 18, 4);
    ctx.fillRect(x - 21, y - 35, 12, 7);

    // عمود الشبكة (ممسك في يد الصياد)
    if (this.net.state === NET_IDLE) {
      ctx.strokeStyle = '#5C2C0E';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 3, y - 18);
      ctx.lineTo(x + 30, y - 30);
      ctx.stroke();
      // إطار الشبكة (دائري صغير)
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + 35, y - 32, 12, 0, Math.PI * 2);
      ctx.stroke();
      // شبكة (خطوط)
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 0.8;
      for (let dx = -10; dx <= 10; dx += 3) {
        ctx.beginPath();
        ctx.moveTo(x + 35 + dx, y - 44);
        ctx.lineTo(x + 35 + dx, y - 20);
        ctx.stroke();
      }
      for (let dy = -10; dy <= 10; dy += 3) {
        ctx.beginPath();
        ctx.moveTo(x + 25, y - 32 + dy);
        ctx.lineTo(x + 45, y - 32 + dy);
        ctx.stroke();
      }
    }

    // عَلم على القارب
    ctx.fillStyle = '#E74C3C';
    ctx.fillRect(x + 35, y - 45, 16, 11);
    ctx.fillStyle = '#C0392B';
    ctx.fillRect(x + 35, y - 45, 2, 28);

    ctx.restore();
  }

  _drawNet() {
    const ctx = this.ctx;
    const x = this.net.x + this.net.shake;
    const y = this.net.y;
    const boatY = this._boatY();
    const boatX = this._boatScreenX();

    // الخيط من الصياد للشبكة
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(boatX + 3, boatY - 18);
    ctx.lineTo(x, y - 18);
    ctx.stroke();

    // رسم صورة الشبكة إذا تحميلها
    if (this.netImage.complete && this.netImage.naturalHeight !== 0) {
      const netW = 60;
      const netH = 60;
      ctx.drawImage(this.netImage, x - netW / 2, y - netH / 2, netW, netH);
    } else {
      // إطار الشبكة (دائرة)
      const radius = 30;
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();

      // خيوط الشبكة (شبكة فعلية)
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      // أفقية
      for (let dy = -radius; dy <= radius; dy += 6) {
        const halfW = Math.sqrt(radius * radius - dy * dy);
        ctx.beginPath();
        ctx.moveTo(x - halfW, y + dy);
        ctx.lineTo(x + halfW, y + dy);
        ctx.stroke();
      }
      // عمودية
      for (let dx = -radius; dx <= radius; dx += 6) {
        const halfH = Math.sqrt(radius * radius - dx * dx);
        ctx.beginPath();
        ctx.moveTo(x + dx, y - halfH);
        ctx.lineTo(x + dx, y + halfH);
        ctx.stroke();
      }
    }

    // إذا في طُعم → أيقونة سمكة
    if (this.net.state === NET_BITE) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 24px Cairo, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 5;
      ctx.fillText('🐟', x, y);
      ctx.shadowBlur = 0;
    }

    // إذا تعرض النتيجة → علامة ✨ على الشبكة (التفاصيل بـ _drawCatchPanel)
    if ((this.net.state === NET_PULLING || this.net.state === NET_SHOWING)
        && this.net.result && this.net.result.letters && this.net.result.type !== 'loss') {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 22px Cairo, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 5;
      ctx.fillText('✨', x, y);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  _drawFish(f) {
    const ctx = this.ctx;
    const goLeft = f.vx < 0;

    ctx.save();
    ctx.translate(f.x, f.y);
    if (goLeft) ctx.scale(-1, 1);

    // ذيل متحرك
    const tailWag = Math.sin(f.tailPhase || 0) * 0.4;
    ctx.save();
    ctx.translate(-f.size, 0);
    ctx.rotate(tailWag);
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-f.size * 0.4, -f.size * 0.5);
    ctx.lineTo(-f.size * 0.55, 0);
    ctx.lineTo(-f.size * 0.4, f.size * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // الجسم (ظلال)
    const bodyGrad = ctx.createLinearGradient(0, -f.size * 0.55, 0, f.size * 0.55);
    bodyGrad.addColorStop(0,   this._lighter(f.color, 30));
    bodyGrad.addColorStop(0.5, f.color);
    bodyGrad.addColorStop(1,   this._darker(f.color, 30));
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, f.size, f.size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // عين
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(f.size * 0.5, -f.size * 0.18, f.size * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(f.size * 0.55, -f.size * 0.18, f.size * 0.10, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _lighter(hex, a) { return this._adjust(hex, a); }
  _darker(hex, a) { return this._adjust(hex, -a); }
  _adjust(hex, amount) {
    const c = hex.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(c.slice(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(c.slice(2, 4), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(c.slice(4, 6), 16) + amount));
    return `rgb(${r},${g},${b})`;
  }
}
