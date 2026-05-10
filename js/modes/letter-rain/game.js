// ===== حلقة اللعبة الرئيسية لنمط مطر الأحرف =====
import { Spawner }      from './spawner.js';
import { Score }        from './score.js';
import { InputHandler } from './input.js';
import { hitTest }      from '../../utils/helpers.js';
import { LETTER_RAIN_CONFIG as CFG } from '../../core/config.js';
import { recordPlayStart, recordPlayEnd } from '../../core/game-stats.js';
import { playCollectSound, playLoseLifeSound, playGameOverSound, playIceFreezSound, playLetterGatheringRainSound, playRainSound } from '../../core/audio.js';

export class LetterRainGame {
  // onQuit: دالة callback تُستدعى عند الخروج للقائمة
  constructor(onQuit) {
    this._onQuit  = onQuit;
    this._canvas  = document.getElementById('game-canvas');
    this._ctx     = this._canvas.getContext('2d');

    this._spawner = new Spawner();
    this._score   = new Score();
    this._input   = null;

    this._entities     = [];
    this._lives        = CFG.INITIAL_LIVES;
    this._frozen       = false;
    this._freezeTimer  = null;
    this._paused       = false;
    this._running      = false;
    this._rafId        = null;
    this._resizeHandler = null;

    this._bindUI();
  }

  // ربط أزرار الـ HUD والـ Overlays مرة واحدة عند الإنشاء
  _bindUI() {
    document.getElementById('btn-pause')
      .addEventListener('click', () => this.togglePause());

    document.getElementById('btn-resume')
      .addEventListener('click', () => this.togglePause());

    document.getElementById('btn-restart')
      .addEventListener('click', () => this.start());

    document.getElementById('btn-quit-pause')
      .addEventListener('click', () => { this.stop(); this._onQuit(); });

    document.getElementById('btn-quit-gameover')
      .addEventListener('click', () => { this.stop(); this._onQuit(); });
  }

  // ===== بدء جولة جديدة =====
  start() {
    this.stop();
    this._resizeCanvas();

    this._entities    = [];
    this._lives       = CFG.INITIAL_LIVES;
    this._frozen      = false;
    this._paused      = false;
    this._running     = true;
    this._startMs     = performance.now();
    this._pausedMs    = 0;
    this._lastPauseAt = null;

    this._spawner.reset();
    this._score.reset();

    this._updateHudLives();
    this._updateHudScore();
    this._clearStrip();
    this._hideOverlay('overlay-gameover');
    this._hideOverlay('overlay-pause');
    this._canvas.classList.remove('frozen');

    this._input = new InputHandler(this._canvas, (x, y) => this._onTap(x, y));

    // إعادة ضبط الكانفاس عند تغيير حجم النافذة
    this._resizeHandler = () => this._resizeCanvas();
    window.addEventListener('resize', this._resizeHandler);

    recordPlayStart('letter-rain');
    playRainSound();
    this._loop();
  }

  // ===== إيقاف كامل (للخروج أو الإعادة) =====
  stop() {
    this._running = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (this._freezeTimer) { clearTimeout(this._freezeTimer); this._freezeTimer = null; }
    if (this._input) { this._input.destroy(); this._input = null; }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    this._canvas.classList.remove('frozen');
  }

  // ===== إيقاف / استئناف مؤقت =====
  togglePause() {
    if (!this._running) return;
    this._paused = !this._paused;
    if (this._paused) {
      // إيقاف حلقة الـ RAF بشكل نظيف
      if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
      this._lastPauseAt = performance.now();
      this._showOverlay('overlay-pause');
    } else {
      // أضف فترة الإيقاف لـ_pausedMs عشان مضاعف السرعة ما يحسبها
      if (this._lastPauseAt) {
        this._pausedMs = (this._pausedMs || 0) + (performance.now() - this._lastPauseAt);
        this._lastPauseAt = null;
      }
      this._hideOverlay('overlay-pause');
      this._loop();
    }
  }

  // ===== حلقة اللعبة الرئيسية =====
  _loop() {
    if (!this._running || this._paused) return;
    this._update();
    this._draw();
    this._rafId = requestAnimationFrame(() => this._loop());
  }

  _update() {
    // ===== مضاعف السرعة بناءً على الوقت المنقضي =====
    const elapsedMs = (performance.now() - (this._startMs || performance.now())) - (this._pausedMs || 0);
    const elapsedSec = Math.max(0, elapsedMs / 1000);
    const speedMult = Math.min(
      CFG.SPEED_MULT_MAX,
      1 + elapsedSec * CFG.SPEED_RAMP_PER_SEC
    );

    const entity = this._spawner.tick(this._canvas.width, this._entities);
    if (entity) {
      // طبق مضاعف السرعة على الكيان الجديد
      entity.speed *= speedMult;
      this._entities.push(entity);
    }

    for (const e of this._entities) e.update(this._frozen);

    // إزالة الكيانات التي انتهت أو خرجت من الشاشة
    this._entities = this._entities.filter(e => {
      if (!e.alive) return false;
      if (e.isOffScreen(this._canvas.height)) { e.alive = false; return false; }
      return true;
    });
  }

  _draw() {
    const ctx = this._ctx;
    const w = this._canvas.width;
    const h = this._canvas.height;

    // خلفية
    ctx.fillStyle = '#080818';
    ctx.fillRect(0, 0, w, h);

    for (const e of this._entities) e.draw(ctx);

    // طبقة زرقاء شفافة أثناء التجميد
    if (this._frozen) {
      ctx.fillStyle = 'rgba(100,180,255,0.08)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ===== معالجة النقر/اللمس =====
  _onTap(x, y) {
    // اعثر على الكيان الأقرب من نقطة اللمس بدلاً من أول كيان يطابق
    // هيك حتى لو في تداخل بين منطقتي لمس، اللاعب يلمس اللي يقصده
    let best = null;
    let bestDist = Infinity;
    for (const e of this._entities) {
      if (!e.alive) continue;
      if (e.collected || e.wasHit) continue;
      if (!hitTest(x, y, e)) continue;
      const dx = x - e.x;
      const dy = y - e.y;
      const d  = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = e; }
    }
    if (!best) return;

    if (best.type === 'letter') {
      best.collected = true;
      const result = this._score.addLetter(best.char, best.spawnTag);
      best._double = (result.count >= 2);
      playCollectSound();
      playLetterGatheringRainSound();
      this._updateHudScore();
      this._addToStrip(best.char);
    } else if (best.type === 'bomb') {
      best.wasHit = true;
      playLoseLifeSound();
      this._loseLife();
    } else if (best.type === 'snowflake') {
      best.collected = true;
      playIceFreezSound();
      this._activateFreeze();
    }
  }

  _loseLife() {
    this._lives = Math.max(0, this._lives - 1);
    this._updateHudLives();
    if (this._lives === 0) {
      // تأخير صغير حتى يظهر أنيميشن القنبلة
      setTimeout(() => this._gameOver(), 450);
    }
  }

  _activateFreeze() {
    if (this._freezeTimer) clearTimeout(this._freezeTimer);
    this._frozen = true;
    this._canvas.classList.add('frozen');
    this._freezeTimer = setTimeout(() => {
      this._frozen = false;
      this._canvas.classList.remove('frozen');
      this._freezeTimer = null;
    }, CFG.FREEZE_DURATION_MS);
  }

  _gameOver() {
    this._running = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    playGameOverSound();
    recordPlayEnd('letter-rain', {
      score: this._score.getScore(),
      lettersCollected: this._score.getLettersCount(),
      won: false,
    });
    document.getElementById('final-score-value').textContent   = this._score.getScore();
    document.getElementById('final-letters-value').textContent = this._score.getLettersCount();
    this._showOverlay('overlay-gameover');
  }

  // ===== تحديث الـ HUD =====
  _updateHudScore() {
    document.getElementById('hud-score-value').textContent = this._score.getScore();
  }

  _updateHudLives() {
    document.querySelectorAll('#hud-lives .heart').forEach((heart, i) => {
      if (i < this._lives) {
        heart.classList.remove('lost');
        heart.textContent = '❤️';
      } else {
        heart.classList.add('lost');
        heart.textContent = '🤍';
      }
    });
  }

  _addToStrip(char) {
    const strip = document.getElementById('caught-strip');
    const item  = document.createElement('span');
    item.className = 'caught-item';
    item.innerHTML = `<span class="caught-letter">${char}</span>`;
    strip.appendChild(item);
    while (strip.children.length > CFG.CAUGHT_STRIP_MAX) {
      strip.removeChild(strip.firstChild);
    }
  }


  _clearStrip() {
    document.getElementById('caught-strip').innerHTML = '';
  }

  _showOverlay(id) { document.getElementById(id).removeAttribute('hidden'); }
  _hideOverlay(id) { document.getElementById(id).setAttribute('hidden', ''); }

  // ضبط حجم الكانفاس ليطابق الحجم الفعلي المعروض
  _resizeCanvas() {
    this._canvas.width  = this._canvas.offsetWidth  || this._canvas.clientWidth;
    this._canvas.height = this._canvas.offsetHeight || this._canvas.clientHeight;
  }
}
