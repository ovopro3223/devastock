// ===== قناصة الأحرف 🎯 =====
import { saveLetterToStock } from '../../core/storage.js';
import { recordLetter } from '../../core/lifetime-storage.js';
import { playShotSound, playCollectSound, playLoseLifeSound } from '../../core/audio.js';

// كلمات للقنص (مكونة من 5-7 أحرف)
const SNIPER_WORDS = [
  'مدرسة', 'سيارة', 'حديقة', 'كتاب', 'جامعة',
  'معلم', 'طبيب', 'مهندس', 'طالب', 'صديق',
  'سفينة', 'طائرة', 'بحر', 'جبل', 'نهر',
  'شجرة', 'وردة', 'فراشة', 'عصفور', 'قمر',
  'ذهب', 'فضة', 'ماس', 'حرير', 'مفتاح',
];

const MAX_MISSES = 3;

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
    this.zoom = 1;         // 1x أو 8x
    this.crosshair = { x: 0, y: 0 };
    this.touchControls = { moveId: null, shootId: null };

    this.running = false;
    this.paused = false;

    // تحميل صورة القناصة
    this.sniperImage = new Image();
    this.sniperImage.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Sniper_rifle.svg/400px-Sniper_rifle.svg';

    this._setupListeners();
  }

  _setupListeners() {
    document.getElementById('sniper-btn-pause').onclick = () => this.pause();
    document.getElementById('sniper-btn-resume').onclick = () => this.resume();
    document.getElementById('sniper-btn-quit-pause').onclick = () => this.quit();
    document.getElementById('sniper-btn-restart').onclick = () => this.restart();
    document.getElementById('sniper-btn-quit-gameover').onclick = () => this.quit();

    document.getElementById('sniper-zoom-btn').onclick = () => this._toggleZoom();

    this.canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e), { passive: false });
    this.canvas.addEventListener('pointermove', (e) => this._onPointerMove(e), { passive: false });
    this.canvas.addEventListener('pointerup', (e) => this._onPointerUp(e), { passive: false });
    this.canvas.addEventListener('pointercancel', (e) => this._onPointerUp(e), { passive: false });

    window.addEventListener('resize', () => this._resize());
  }

  _onPointerDown(e) {
    if (!this.running || this.paused) return;
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // اضغط/المس مكان → يحدد crosshair هناك ثم يطلق
    this.crosshair.x = x;
    this.crosshair.y = y;
    this._shoot();
  }

  _onPointerMove(e) {
    if (!this.running || this.paused) return;
    // تحديث crosshair فقط لو ما زال الإصبع مضغوطاً (للسحب) أو الفأرة على الشاشة
    if (e.pointerType !== 'touch' || e.buttons > 0) {
      const rect = this.canvas.getBoundingClientRect();
      this.crosshair.x = e.clientX - rect.left;
      this.crosshair.y = e.clientY - rect.top;
    }
  }

  _onPointerUp(e) {
    // تنظيف
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.W = rect.width;
    this.H = rect.height;
    this.crosshair = { x: this.W / 2, y: this.H / 2 };
  }

  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.crosshair.x = e.clientX - rect.left;
    this.crosshair.y = e.clientY - rect.top;
  }

  _onShoot(e) {
    if (!this.running || this.paused) return;
    this._shoot();
  }

  _shoot() {
    if (!this.running || this.paused) return;

    // crosshair يحفظ إحداثيات الشاشة (مكان الضغط)
    // الأهداف موجودة بإحداثيات الشاشة (peekX, peekY بدون تحويل)
    // فالمقارنة مباشرة بدون تحويل
    const aimX = this.crosshair.x;
    const aimY = this.crosshair.y;

    // منطقة إصابة كبيرة لتسهيل اللعب (خاصة على الموبايل)
    const hitRadius = this.zoom > 1 ? 70 : 55;

    let hit = null;
    let bestDist = Infinity;
    for (const t of this.targets) {
      if (t.shot) continue;
      const dx = t.peekX - aimX;
      const dy = t.peekY - aimY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < hitRadius && dist < bestDist) {
        hit = t;
        bestDist = dist;
      }
    }

    playShotSound();

    if (hit) {
      hit.shot = true;
      this.revealed[hit.index] = hit.char;
      saveLetterToStock(hit.char);
      recordLetter(hit.char, 1);
      playCollectSound();
      this._updateWordDisplay();

      if (this.revealed.every(r => r !== null)) {
        this._win();
      }
    } else {
      this.misses++;
      playLoseLifeSound();
      this._updateHUD();
      this._flashMiss();
      if (this.misses >= MAX_MISSES) {
        this._gameOver();
      }
    }
  }

  _toggleZoom() {
    this.zoom = this.zoom === 1 ? 8 : 1;
    const btn = document.getElementById('sniper-zoom-btn');
    if (btn) {
      btn.classList.toggle('active', this.zoom === 8);
      btn.textContent = this.zoom === 1 ? '🔭 زووم 8x' : '👁 خروج زووم';
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
    document.getElementById('sniper-zoom-btn').textContent = '🔭 زووم 8x';

    // اختر كلمة عشوائية
    this.word = SNIPER_WORDS[Math.floor(Math.random() * SNIPER_WORDS.length)];
    this.revealed = new Array(this.word.length).fill(null);

    // أنشئ الأهداف (شجرة لكل حرف)
    this.targets = [];
    const margin = 80;
    const treeY = this.H * 0.5;
    for (let i = 0; i < this.word.length; i++) {
      const x = margin + (this.W - margin * 2) * (i + 0.5) / this.word.length;
      this.targets.push({
        index: i,
        char: this.word[i],
        treeX: x,
        treeY: treeY + (Math.random() - 0.5) * 40,
        peekX: x + (Math.random() < 0.5 ? -25 : 25),
        peekY: treeY - 10,
        shot: false,
      });
    }

    this._updateHUD();
    this._updateWordDisplay();

    document.getElementById('sniper-overlay-pause').hidden = true;
    document.getElementById('sniper-overlay-gameover').hidden = true;

    this.running = true;
    this.paused = false;
    this._lastTime = performance.now();
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
    document.getElementById('sniper-overlay-pause').hidden = true;
    document.getElementById('sniper-overlay-gameover').hidden = true;
    this.onExit();
  }

  restart() {
    document.getElementById('sniper-overlay-gameover').hidden = true;
    this.start();
  }

  _gameOver() {
    this.running = false;
    document.getElementById('sniper-end-title').textContent = 'خسرت 💔';
    document.getElementById('sniper-final-word').textContent = this.word;
    document.getElementById('sniper-overlay-gameover').hidden = false;
  }

  _win() {
    this.running = false;
    document.getElementById('sniper-end-title').textContent = 'فزت! 🎯';
    document.getElementById('sniper-final-word').textContent = this.word;
    document.getElementById('sniper-overlay-gameover').hidden = false;
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

  _draw() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;

    // طبيعة - السماء
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.6);
    sky.addColorStop(0, '#5DADE2');
    sky.addColorStop(1, '#A8D8E8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.6);

    // الأرض - عشب
    const ground = ctx.createLinearGradient(0, H * 0.6, 0, H);
    ground.addColorStop(0, '#5C8C3A');
    ground.addColorStop(1, '#2D5016');
    ctx.fillStyle = ground;
    ctx.fillRect(0, H * 0.6, W, H * 0.4);

    // جبال خلفية
    ctx.fillStyle = '#7FB069';
    for (let i = 0; i < 5; i++) {
      const x = (W / 5) * i + W / 10;
      ctx.beginPath();
      ctx.moveTo(x - 80, H * 0.6);
      ctx.lineTo(x, H * 0.45);
      ctx.lineTo(x + 80, H * 0.6);
      ctx.fill();
    }

    // رسم الأشجار والأحرف (بدون تحويل الزووم — لإصابة أدق)
    for (const t of this.targets) {
      this._drawTree(t.treeX, t.treeY);

      if (!t.shot) {
        const isZoom = this.zoom > 1;
        // مع الزووم الحروف أوضح وأكبر
        ctx.fillStyle = isZoom ? '#FFD700' : 'rgba(255,215,0,0.45)';
        ctx.font = isZoom ? 'bold 38px Cairo, Arial' : 'bold 24px Cairo, Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = isZoom ? 3 : 2;
        ctx.strokeText(t.char, t.peekX, t.peekY);
        ctx.fillText(t.char, t.peekX, t.peekY);
      }
    }

    if (this.zoom > 1) {

      // رسم scope overlay (دائرة سوداء على الأطراف)
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.35, 0, Math.PI * 2, true);
      ctx.fill();

      // إطار الـ scope
      ctx.strokeStyle = '#1A1A1A';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.35, 0, Math.PI * 2);
      ctx.stroke();

      // خطوط الـ scope (cross)
      ctx.strokeStyle = 'rgba(255,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(W / 2 - Math.min(W, H) * 0.35, H / 2);
      ctx.lineTo(W / 2 + Math.min(W, H) * 0.35, H / 2);
      ctx.moveTo(W / 2, H / 2 - Math.min(W, H) * 0.35);
      ctx.lineTo(W / 2, H / 2 + Math.min(W, H) * 0.35);
      ctx.stroke();

      // نقطة وسط
      ctx.fillStyle = '#FF0000';
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // crosshair بسيط بدون زووم
      this._drawCrosshair();
    }

    // رسم القناصة في الأسفل
    this._drawSniper();
  }

  _drawSniper() {
    const ctx = this.ctx;
    const sniperW = 200;
    const sniperH = 60;
    const sniperX = this.W / 2 - sniperW / 2;
    const sniperY = this.H - sniperH - 20;

    if (this.sniperImage.complete && this.sniperImage.naturalHeight !== 0) {
      ctx.drawImage(this.sniperImage, sniperX, sniperY, sniperW, sniperH);
    } else {
      // رسم احتياطي
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(sniperX, sniperY, sniperW, sniperH);
      ctx.fillStyle = '#000000';
      ctx.fillRect(sniperX + 10, sniperY + 10, sniperW - 20, sniperH - 20);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px Cairo, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('قناصة', sniperX + sniperW / 2, sniperY + sniperH / 2);
    }
  }

  _drawTree(x, y) {
    const ctx = this.ctx;
    // الجذع
    ctx.fillStyle = '#5C2C0E';
    ctx.fillRect(x - 8, y, 16, 50);
    // الأوراق
    ctx.fillStyle = '#1F5A1F';
    ctx.beginPath();
    ctx.arc(x, y - 10, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2D7A2D';
    ctx.beginPath();
    ctx.arc(x - 14, y - 22, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 14, y - 22, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3F8B3D';
    ctx.beginPath();
    ctx.arc(x, y - 30, 24, 0, Math.PI * 2);
    ctx.fill();
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
