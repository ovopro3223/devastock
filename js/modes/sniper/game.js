// ===== قناصة الأحرف 🎯 =====
import { saveLetterToStock } from '../../core/storage.js';
import { awardLetter } from '../../core/rare-letters.js';
import { recordLetter } from '../../core/lifetime-storage.js';
import { playShotSound, playCollectSound, playLoseLifeSound, playHitSound, playMissSound, playLooseSound, playScopeOnSound, playWinSound } from '../../core/audio.js';
import { recordPlayStart, recordPlayEnd } from '../../core/game-stats.js';
import { incrementCounter } from '../../core/achievements.js';

// كلمات للقنص (مكونة من 5-7 أحرف)
const SNIPER_WORDS = [
  'مدرسة', 'سيارة', 'حديقة', 'كتاب', 'جامعة',
  'معلم', 'طبيب', 'مهندس', 'طالب', 'صديق',
  'سفينة', 'طائرة', 'بحر', 'جبل', 'نهر',
  'شجرة', 'وردة', 'فراشة', 'عصفور', 'قمر',
  'ذهب', 'فضة', 'ماس', 'حرير', 'مفتاح',
];

const MAX_MISSES = 3;

// ===== أصول الصور =====
const ASSETS_PATH = 'assets/sniper/';
function loadImage(src) {
  const img = new Image();
  img.src = ASSETS_PATH + src;
  return img;
}
const ASSETS = {
  sniperBody:  loadImage('sniper-body.png'),
  rifle:       loadImage('rifle.png'),
  trees:       [loadImage('tree-1.png'), loadImage('tree-2.png'), loadImage('tree-3.png')],
  mountains:   [loadImage('mountain-1.png'), loadImage('mountain-2.png')],
  grasses:     [loadImage('grass-1.png'), loadImage('grass-2.png')],
  bush:        loadImage('bush.png'),
  rocks:       [loadImage('rock-1.png'), loadImage('rock-2.png')],
  sun:         loadImage('sun.png'),
  target:      loadImage('target.png'),
  muzzleFlash: loadImage('muzzle-flash.png'),
};
function isImgReady(img) {
  return img && img.complete && img.naturalHeight > 0;
}

export class SniperGame {
  constructor(onExit) {
    this.onExit = onExit;
    this.canvas = document.getElementById('sniper-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.W = 0;
    this.H = 0;

    this.word = '';
    this.targets = [];     // الأهداف (أحرف خلف أشجار)
    this.revealed = [];    // ما كُشف من الكلمة
    this.misses = 0;
    this.zoom = 1;         // 1x أو 3x (تكبير فعلي)
    this.zoomFactor = 3;   // معامل التكبير الفعلي عند الزوم
    this.crosshair = { x: 0, y: 0 };
    this.muzzleFlash = 0;

    // كانفاس مخفي لرسم المشهد عشان نقدر نكبره داخل دائرة السكوب
    this.offCanvas = document.createElement('canvas');
    this.offCtx = this.offCanvas.getContext('2d');

    this.running = false;
    this.paused = false;

    this._setupListeners();
  }

  _setupListeners() {
    document.getElementById('sniper-btn-pause').onclick = () => this.pause();
    document.getElementById('sniper-btn-resume').onclick = () => this.resume();
    document.getElementById('sniper-btn-quit-pause').onclick = () => this.quit();
    document.getElementById('sniper-btn-restart').onclick = () => this.restart();
    document.getElementById('sniper-btn-quit-gameover').onclick = () => this.quit();

    document.getElementById('sniper-zoom-btn').onclick = () => this._toggleZoom();

    const fireBtn = document.getElementById('sniper-fire-btn');
    if (fireBtn) {
      fireBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.running || this.paused) return;
        fireBtn.classList.add('firing');
        this._shoot();
      });
      fireBtn.addEventListener('pointerup',     () => fireBtn.classList.remove('firing'));
      fireBtn.addEventListener('pointercancel', () => fireBtn.classList.remove('firing'));
      fireBtn.addEventListener('pointerleave',  () => fireBtn.classList.remove('firing'));
    }

    // الكانفاس: pointermove للتصويب، pointerdown بالماوس للإطلاق المباشر
    this.canvas.addEventListener('pointermove', (e) => this._onPointerAim(e), { passive: false });
    this.canvas.addEventListener('pointerdown', (e) => this._onCanvasPointerDown(e), { passive: false });

    // مفتاح المسافة على اللابتوب = إطلاق
    this._onKeyDown = (e) => {
      if (!this.running || this.paused) return;
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        this._shoot();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);

    window.addEventListener('resize', () => this._resize());
  }

  _onPointerAim(e) {
    if (!this.running || this.paused) return;
    // مع اللمس: pointermove يُطلق فقط أثناء ضغط الإصبع — ممتاز للسحب
    // مع الفأرة: يُحدّث دائماً سواء بضغط أو بدونه
    if (e.pointerType === 'touch' && e.buttons === 0) return;
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    this.crosshair.x = e.clientX - rect.left;
    this.crosshair.y = e.clientY - rect.top;
  }

  _onCanvasPointerDown(e) {
    if (!this.running || this.paused) return;
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    this.crosshair.x = e.clientX - rect.left;
    this.crosshair.y = e.clientY - rect.top;
    // اللمس: ضغطة الإصبع تُحدّث الموقع فقط (لا تُطلق — الإطلاق من زر 🎯)
    // الفأرة: الكبس على الكانفاس يُطلق مباشرة على نفس المكان
    if (e.pointerType !== 'touch') {
      this._shoot();
    }
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.W = rect.width;
    this.H = rect.height;
    if (this.crosshair.x === 0 && this.crosshair.y === 0) {
      this.crosshair = { x: this.W / 2, y: this.H * 0.45 };
    }
  }

  _shoot() {
    if (!this.running || this.paused) return;

    // crosshair بإحداثيات الكانفاس، الأهداف بنفس الإحداثيات
    const aimX = this.crosshair.x;
    const aimY = this.crosshair.y;

    // إصابة دقيقة: فقط داخل دائرة الهدف الفعلية (نصف القطر = نصف حجم الصورة)
    // TARGET_SIZE = 14 px → نصف القطر 7 px (صغير جداً، يحتاج زوم)
    const TARGET_SIZE = 14;
    const hitRadius = TARGET_SIZE / 2;

    let hit = null;
    let bestDist = Infinity;
    for (const t of this.targets) {
      if (t.shot) continue;
      const dx = t.peekX - aimX;
      const dy = t.peekY - aimY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= hitRadius && dist < bestDist) {
        hit = t;
        bestDist = dist;
      }
    }

    playShotSound();
    this.muzzleFlash = 6;

    if (hit) {
      hit.shot = true;
      this.revealed[hit.index] = hit.char;
      const r = awardLetter('sniper', hit.char);
      this._lettersCollectedThisRun = (this._lettersCollectedThisRun || 0) + r.count;
      playCollectSound();
      playHitSound();
      this._updateWordDisplay();

      if (this.revealed.every(r => r !== null)) {
        this._win();
      }
    } else {
      this.misses++;
      playLoseLifeSound();
      playMissSound();
      this._updateHUD();
      this._flashMiss();
      if (this.misses >= MAX_MISSES) {
        this._gameOver();
      }
    }
  }

  _toggleZoom() {
    this.zoom = this.zoom === 1 ? this.zoomFactor : 1;
    playScopeOnSound();
    const btn = document.getElementById('sniper-zoom-btn');
    if (btn) {
      btn.classList.toggle('active', this.zoom > 1);
      btn.textContent = this.zoom === 1 ? '🔭 زووم 3x' : '👁 خروج زووم';
    }
  }

  start() {
    // انتظر لحظة للتأكد من layout
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
    this.misses = 0;
    this.zoom = 1;
    document.getElementById('sniper-zoom-btn').classList.remove('active');
    document.getElementById('sniper-zoom-btn').textContent = '🔭 زووم 3x';

    // اختر كلمة عشوائية
    this.word = SNIPER_WORDS[Math.floor(Math.random() * SNIPER_WORDS.length)];
    this.revealed = new Array(this.word.length).fill(null);

    // أنشئ الأهداف (شجرة لكل حرف) — قريبة من خط الأفق (بعيدة عن المصوّر)
    this.targets = [];
    const margin = 80;
    const treeBaseY = this.H * 0.48;  // قاعدة الشجرة قريبة من الأفق (تبدو بعيدة)
    for (let i = 0; i < this.word.length; i++) {
      const x = margin + (this.W - margin * 2) * (i + 0.5) / this.word.length;
      const ty = treeBaseY + (Math.random() - 0.5) * 24;
      this.targets.push({
        index: i,
        char: this.word[i],
        treeX: x,
        treeY: ty,
        peekX: x + (Math.random() < 0.5 ? -32 : 32),
        peekY: ty - 50,
        treeVariant: Math.floor(Math.random() * ASSETS.trees.length),
        shot: false,
      });
    }

    // مشهد الخلفية: جبال، غابة، شجيرات، صخور (موزعة بشكل عشوائي ثابت لكل جولة)
    this.scenery = {
      mountains: [],
      forest: [],
      bushes: [],
      rocks: [],
    };
    // جبال خلفية
    const mountainCount = 4;
    for (let i = 0; i < mountainCount; i++) {
      this.scenery.mountains.push({
        x: (this.W / mountainCount) * i + (Math.random() - 0.5) * 80,
        variant: i % 2,
        scale: 0.85 + Math.random() * 0.4,
      });
    }
    // ===== غابة كثيفة قدام الجبال (لكن خلف أشجار الأهداف) =====
    const forestCount = 18;
    for (let i = 0; i < forestCount; i++) {
      this.scenery.forest.push({
        x: Math.random() * (this.W + 100) - 50,
        y: this.H * (0.40 + Math.random() * 0.10),  // قرب الأفق → تبدو بعيدة
        variant: Math.floor(Math.random() * ASSETS.trees.length),
        scale: 0.35 + Math.random() * 0.30,         // صغيرة (perspective بُعد)
      });
    }
    // طبقة غابة وسطى — أكبر شوي وقريبة
    for (let i = 0; i < 10; i++) {
      this.scenery.forest.push({
        x: Math.random() * (this.W + 100) - 50,
        y: this.H * (0.50 + Math.random() * 0.06),
        variant: Math.floor(Math.random() * ASSETS.trees.length),
        scale: 0.55 + Math.random() * 0.20,
      });
    }
    // شجيرات وصخور أمامية
    for (let i = 0; i < 8; i++) {
      this.scenery.bushes.push({
        x: Math.random() * this.W,
        y: this.H * (0.62 + Math.random() * 0.12),
        scale: 0.6 + Math.random() * 0.5,
      });
    }
    for (let i = 0; i < 6; i++) {
      this.scenery.rocks.push({
        x: Math.random() * this.W,
        y: this.H * (0.66 + Math.random() * 0.12),
        variant: Math.floor(Math.random() * ASSETS.rocks.length),
        scale: 0.6 + Math.random() * 0.5,
      });
    }

    this._updateHUD();
    this._updateWordDisplay();

    document.getElementById('sniper-overlay-pause').hidden = true;
    document.getElementById('sniper-overlay-gameover').hidden = true;

    // أظهر دليل التحكم وأخفه بعد 10 ثوان
    const touchGuide = document.getElementById('sniper-touch-guide');
    if (touchGuide) {
      touchGuide.classList.remove('sniper-touch-guide-hidden');
      if (this._guideHideTimer) clearTimeout(this._guideHideTimer);
      this._guideHideTimer = setTimeout(() => {
        touchGuide.classList.add('sniper-touch-guide-hidden');
      }, 10000);
    }

    this.running = true;
    this.paused = false;
    this.canvas.classList.remove('frozen');
    this._lastTime = performance.now();
    this._lettersCollectedThisRun = 0;
    recordPlayStart('sniper');
    this._loop();
  }

  pause() {
    if (!this.running) return;
    this.paused = true;
    document.getElementById('sniper-overlay-pause').hidden = false;
  }

  resume() {
    this.paused = false;
    document.getElementById('sniper-overlay-pause').hidden = true;
    this._lastTime = performance.now();
    this._loop();
  }

  quit() {
    this.running = false;
    this._setGameInteraction(true);
    if (this._guideHideTimer) { clearTimeout(this._guideHideTimer); this._guideHideTimer = null; }
    document.getElementById('sniper-overlay-pause').hidden = true;
    document.getElementById('sniper-overlay-gameover').hidden = true;
    this.onExit();
  }

  restart() {
    document.getElementById('sniper-overlay-gameover').hidden = true;
    this._setGameInteraction(true);
    this.start();
  }

  _gameOver() {
    playLooseSound();
    recordPlayEnd('sniper', {
      score: 0,
      lettersCollected: this._lettersCollectedThisRun || 0,
      won: false,
    });
    this._showGameResult('خسرت 💔', this.word, 'إعادة كلمة جديدة أو العودة للقائمة');
  }

  _win() {
    playWinSound();
    incrementCounter('sniper_words_completed');
    recordPlayEnd('sniper', {
      score: this.word.length * 10,
      lettersCollected: this._lettersCollectedThisRun || 0,
      won: true,
    });
    this._showGameResult('فزت! 🎯', this.word, 'إعادة كلمة جديدة أو العودة للقائمة');
  }

  _updateHUD() {
    const hearts = document.getElementById('sniper-hud-lives').children;
    for (let i = 0; i < 3; i++) {
      hearts[i].style.opacity = i < (MAX_MISSES - this.misses) ? 1 : 0.2;
    }

    const collected = this.revealed.filter(r => r !== null).length;
    document.getElementById('sniper-word-progress').textContent = `${collected}/${this.word.length}`;
  }

  _updateWordDisplay() {
    const container = document.getElementById('sniper-word-display');
    if (!container) return;

    container.innerHTML = this.revealed.map(c => {
      if (c) {
        return `<div class="sniper-letter-slot revealed">${c}</div>`;
      } else {
        return `<div class="sniper-letter-slot empty">؟</div>`;
      }
    }).join('');

    this._updateHUD();
    this._checkWordCompletion();
  }

  _checkWordCompletion() {
    if (!this.running || this.paused) return;
    if (this.revealed.length === 0) return;
    if (this.revealed.every(r => r !== null)) {
      this._win();
    }
  }

  _setGameInteraction(enabled) {
    const canvas = this.canvas;
    const fireBtn = document.getElementById('sniper-fire-btn');
    const zoomBtn = document.getElementById('sniper-zoom-btn');
    if (canvas) canvas.style.pointerEvents = enabled ? '' : 'none';
    if (fireBtn) fireBtn.disabled = !enabled;
    if (zoomBtn) zoomBtn.disabled = !enabled;
  }

  _showGameResult(title, word, message) {
    this.running = false;
    this._setGameInteraction(false);
    document.getElementById('sniper-end-title').textContent = title;
    document.getElementById('sniper-final-word').textContent = word;
    const messageEl = document.getElementById('sniper-end-message');
    if (messageEl) messageEl.textContent = message;
    document.getElementById('sniper-overlay-gameover').hidden = false;
  }

  _flashMiss() {
    // أنميشن خطأ - وميض أحمر سريع
    const canvas = this.canvas;
    canvas.style.filter = 'brightness(1.5) saturate(2) hue-rotate(-30deg)';
    setTimeout(() => { canvas.style.filter = ''; }, 200);
  }

  _loop = () => {
    if (!this.running || this.paused) return;
    const now = performance.now();
    const dt = now - (this._lastTime || now);
    this._lastTime = now;

    try {
      this._update(dt);
      this._checkWordCompletion();
      this._draw();
    } catch (e) {
      console.error('Sniper loop error:', e);
    }
    requestAnimationFrame(this._loop);
  };

  _update(dt) {
    // الأهداف مخفية داخل الشجر لكن ليست منفلتة، تظهر بوضوح فقط مع السكوب
    for (const t of this.targets) {
      if (t.shot) continue;
      // اضبط انحراف الحرف بشكل طفيف لتبدو القناصة طبيعية
      t.peekX += Math.sin(dt * 0.003 + t.index) * 0.02;
      t.peekY += Math.cos(dt * 0.002 + t.index) * 0.01;
    }
  }

  _drawScene(ctx) {
    const W = this.W, H = this.H;
    const horizonY = H * 0.38;

    // ===== السماء =====
    const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0, '#5DADE2');
    sky.addColorStop(1, '#A8D8E8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizonY);

    // ===== الشمس =====
    if (isImgReady(ASSETS.sun)) {
      const sw = 130;
      const sh = sw * (ASSETS.sun.naturalHeight / ASSETS.sun.naturalWidth);
      ctx.drawImage(ASSETS.sun, W * 0.85 - sw / 2, H * 0.10 - sh / 2, sw, sh);
    }

    // ===== الأرض =====
    const ground = ctx.createLinearGradient(0, horizonY, 0, H);
    ground.addColorStop(0, '#7CB85A');
    ground.addColorStop(0.5, '#5C8C3A');
    ground.addColorStop(1, '#2D5016');
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    // ===== جبال خلفية =====
    if (this.scenery && this.scenery.mountains.length) {
      for (const m of this.scenery.mountains) {
        const img = ASSETS.mountains[m.variant];
        if (!isImgReady(img)) continue;
        const mw = 380 * m.scale;
        const mh = mw * (img.naturalHeight / img.naturalWidth);
        ctx.drawImage(img, m.x - mw / 2, horizonY - mh * 0.85, mw, mh);
      }
    }

    // ===== شريط عشب على خط الأفق =====
    if (isImgReady(ASSETS.grasses[0])) {
      const gImg = ASSETS.grasses[0];
      const gW = 220;
      const gH = gW * (gImg.naturalHeight / gImg.naturalWidth);
      for (let x = 0; x < W; x += gW - 10) {
        ctx.drawImage(gImg, x, horizonY - gH * 0.15, gW, gH);
      }
    }

    // ===== Helper لرسم شجرة بحجم متغير =====
    const _drawTreeOn = (x, y, variant, scale = 1) => {
      const img = ASSETS.trees[variant % ASSETS.trees.length];
      if (isImgReady(img)) {
        const tw = 150 * scale;
        const th = tw * (img.naturalHeight / img.naturalWidth);
        ctx.drawImage(img, x - tw / 2, y - th * 0.92, tw, th);
      } else {
        ctx.fillStyle = '#5C2C0E';
        ctx.fillRect(x - 8 * scale, y, 16 * scale, 50 * scale);
        ctx.fillStyle = '#2D7A2D';
        ctx.beginPath();
        ctx.arc(x, y - 20 * scale, 35 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // ===== الغابة الخلفية (مرتبة من الأبعد للأقرب) =====
    if (this.scenery && this.scenery.forest.length) {
      const sortedForest = [...this.scenery.forest].sort((a, b) => a.y - b.y);
      for (const f of sortedForest) {
        _drawTreeOn(f.x, f.y, f.variant, f.scale);
      }
    }

    // ===== أشجار الأهداف (الشجرة أولاً) ثم الأهداف فوقها =====
    const sortedTargets = [...this.targets].sort((a, b) => a.treeY - b.treeY);

    // طبقة 1: ارسم كل الأشجار أولاً
    for (const t of sortedTargets) {
      _drawTreeOn(t.treeX, t.treeY, t.treeVariant);
    }
    // طبقة 2: ارسم الأهداف والأحرف فوق الأشجار (مش متخفية)
    for (const t of sortedTargets) {
      if (t.shot) continue;
      // الهدف (دائرة بولزآي) — صغير 14 px، دائماً مرئي
      if (isImgReady(ASSETS.target)) {
        const tw = 14;
        ctx.drawImage(ASSETS.target, t.peekX - tw / 2, t.peekY - tw / 2, tw, tw);
      }
      // الحرف فوق الهدف — صغير، يحتاج زوم لقراءته
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px Cairo, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.strokeText(t.char, t.peekX, t.peekY);
      ctx.fillText(t.char, t.peekX, t.peekY);
    }

    // ===== شجيرات وصخور =====
    if (this.scenery) {
      for (const b of this.scenery.bushes) {
        if (!isImgReady(ASSETS.bush)) break;
        const bw = 80 * b.scale;
        const bh = bw * (ASSETS.bush.naturalHeight / ASSETS.bush.naturalWidth);
        ctx.drawImage(ASSETS.bush, b.x - bw / 2, b.y - bh, bw, bh);
      }
      for (const r of this.scenery.rocks) {
        const img = ASSETS.rocks[r.variant];
        if (!isImgReady(img)) continue;
        const rw = 70 * r.scale;
        const rh = rw * (img.naturalHeight / img.naturalWidth);
        ctx.drawImage(img, r.x - rw / 2, r.y - rh, rw, rh);
      }
    }

    // ===== شريط عشب أمامي =====
    if (isImgReady(ASSETS.grasses[1])) {
      const gImg = ASSETS.grasses[1];
      const gW = 280;
      const gH = gW * (gImg.naturalHeight / gImg.naturalWidth);
      for (let x = -20; x < W; x += gW - 15) {
        ctx.drawImage(gImg, x, H - gH * 0.95, gW, gH);
      }
    }
  }

  _draw() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    const isZoom = this.zoom > 1;

    // ضمان أبعاد الكانفاس المخفي
    if (this.offCanvas.width !== W || this.offCanvas.height !== H) {
      this.offCanvas.width = W;
      this.offCanvas.height = H;
    }

    // ارسم المشهد الكامل على الكانفاس المخفي
    this._drawScene(this.offCtx);

    // ارسم الكانفاس المخفي (المشهد العادي) للكانفاس الرئيسي
    ctx.drawImage(this.offCanvas, 0, 0);

    if (isZoom) {
      // ===== الزوم الفعلي: تكبير المشهد حول نقطة الـ crosshair =====
      const cx = this.crosshair.x;
      const cy = this.crosshair.y;
      const radius = Math.min(W, H) * 0.42;
      const z = this.zoomFactor;

      // قناع داكن خارج الدائرة
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
      ctx.fill();
      ctx.restore();

      // داخل الدائرة: ارسم المشهد مكبر بحيث نقطة (cx, cy) في الكانفاس المخفي
      // تظهر بنفس مكانها (cx, cy) على الكانفاس الرئيسي — يعني التكبير حول crosshair
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      // تطبيق تحويل: تكبير z حول النقطة (cx, cy)
      ctx.translate(cx, cy);
      ctx.scale(z, z);
      ctx.translate(-cx, -cy);
      ctx.drawImage(this.offCanvas, 0, 0);
      ctx.restore();

      // إطار السكوب (دائرة سوداء سميكة)
      ctx.strokeStyle = '#0A0A0A';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 4, 0, Math.PI * 2);
      ctx.stroke();

      // خطوط reticle داخل السكوب
      ctx.strokeStyle = 'rgba(255,0,0,0.65)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.stroke();

      // نقطة وسط
      ctx.fillStyle = '#FF0000';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      this._drawCrosshair();
    }

    this._drawSniper();
  }

  _drawSniper() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;

    // ===== مكان وحجم الجندي =====
    // الصورة الأصلية عمودية في وضعها الطبيعي — الرأس فوق، الساقين تحت
    const cx = W / 2;
    const bodyImg = ASSETS.sniperBody;
    const bodyW = Math.min(380, W * 0.45);
    const bodyH = isImgReady(bodyImg)
      ? bodyW * (bodyImg.naturalHeight / bodyImg.naturalWidth)
      : bodyW * 0.6;

    // قاعدة الجسم قريبة من أسفل الشاشة
    const bodyBottomY = H - 30;
    const bodyTopY = bodyBottomY - bodyH;

    // الكتف/اليدين عند منتصف الجسم تقريباً (هنا الذراعين الممدودتين بالصورة)
    const shoulderX = cx;
    const shoulderY = bodyTopY + bodyH * 0.45;

    // زاوية البندقية تتبع الـ crosshair
    const dx = this.crosshair.x - shoulderX;
    const dy = this.crosshair.y - shoulderY;
    let angle = Math.atan2(dy, dx);
    const maxA = -Math.PI * 0.05;
    const minA = -Math.PI * 0.95;
    if (angle > maxA && angle < Math.PI / 2) angle = maxA;
    else if (angle < minA || angle > Math.PI / 2) angle = minA;

    ctx.save();

    // ===== ظل خفيف تحت الجسم =====
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, bodyBottomY + 6, bodyW * 0.4, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // ===== البندقية أولاً (تحت الجسم) — تدور حول الكتف =====
    // الفوهة في الصورة على اليسار → +π للزاوية
    const rifleImg = ASSETS.rifle;
    if (isImgReady(rifleImg)) {
      ctx.save();
      ctx.translate(shoulderX, shoulderY);
      ctx.rotate(angle + Math.PI);

      const rW = 200;
      const rH = rW * (rifleImg.naturalHeight / rifleImg.naturalWidth);
      const gripX = rW * 0.72;
      ctx.drawImage(rifleImg, -gripX, -rH / 2, rW, rH);

      // وميض الإطلاق عند الفوهة
      if (this.muzzleFlash > 0 && isImgReady(ASSETS.muzzleFlash)) {
        const t = this.muzzleFlash / 6;
        const flashImg = ASSETS.muzzleFlash;
        const fw = 90 * t;
        const fh = fw * (flashImg.naturalHeight / flashImg.naturalWidth);
        const muzzleX = -gripX - 5;
        ctx.globalAlpha = t;
        ctx.drawImage(flashImg, muzzleX - fw / 2, -fh / 2, fw, fh);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    }

    // ===== جسم القناصة فوق البندقية (يخفي الجزء اللي تحته) =====
    if (isImgReady(bodyImg)) {
      ctx.drawImage(bodyImg, cx - bodyW / 2, bodyTopY, bodyW, bodyH);
    } else {
      ctx.fillStyle = '#4a5d2f';
      ctx.beginPath();
      ctx.ellipse(cx, bodyTopY + bodyH * 0.5, bodyW * 0.4, bodyH * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    if (this.muzzleFlash > 0) this.muzzleFlash--;
  }

  _drawTree(x, y, variant = 0) {
    const ctx = this.ctx;
    const img = ASSETS.trees[variant % ASSETS.trees.length];
    if (isImgReady(img)) {
      const tw = 150;
      const th = tw * (img.naturalHeight / img.naturalWidth);
      // y هو موقع جذع الشجرة على الأرض، الصورة بكاملها فوقه
      ctx.drawImage(img, x - tw / 2, y - th * 0.92, tw, th);
    } else {
      // احتياطي بسيط
      ctx.fillStyle = '#5C2C0E';
      ctx.fillRect(x - 8, y, 16, 50);
      ctx.fillStyle = '#2D7A2D';
      ctx.beginPath();
      ctx.arc(x, y - 20, 35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawCrosshair() {
    const ctx = this.ctx;
    const x = this.crosshair.x;
    const y = this.crosshair.y;

    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.moveTo(x - 18, y);
    ctx.lineTo(x - 6, y);
    ctx.moveTo(x + 6, y);
    ctx.lineTo(x + 18, y);
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x, y - 6);
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x, y + 18);
    ctx.stroke();
  }
}
