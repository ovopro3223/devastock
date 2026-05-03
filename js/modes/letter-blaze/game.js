// ===== حريق الحروف — نمط اللعب الثاني =====
// اضغط الحروف قبل أن تنفجر! كل حرف له عداد ينتهي باشتعاله
import { saveLetterToStock }          from '../../core/storage.js';
import { awardLetter }                 from '../../core/rare-letters.js';
import { getCollectedMuseumLetterSet } from '../../core/museum-storage.js';
import { recordPlayStart, recordPlayEnd } from '../../core/game-stats.js';

const COLS = 3;
const ROWS = 3;
const TILE_COUNT = COLS * ROWS;   // 9 tiles
const ARABIC = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split('');
const LETTER_WEIGHTS = {
  ا: 1, ب: 1, ت: 1, ث: 2, ج: 3, ح: 2, خ: 3, د: 1, ذ: 3,
  ر: 2, ز: 2, س: 2, ش: 3, ص: 3, ض: 4, ط: 3, ظ: 4, ع: 3,
  غ: 4, ف: 3, ق: 4, ك: 2, ل: 1, م: 2, ن: 2, ه: 1, و: 1, ي: 1,
};
const INITIAL_LIVES    = 3;
const RESPAWN_DELAY_MS = 380;

const DIFFICULTY_SETTINGS = {
  easy: {
    spawnOffset: 140,
    timerBase: 3800,
    timerMin: 1800,
    doubleChance: 0.08,
    bonusScale: 1,
  },
  hard: {
    spawnOffset: 90,
    timerBase: 2400,
    timerMin: 1000,
    doubleChance: 0.18,
    bonusScale: 1.5,
  },
};

function timerFor(score, difficulty) {
  const settings = DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.easy;
  return Math.max(settings.timerMin, settings.timerBase - score * (difficulty === 'hard' ? 28 : 18));
}

// ===== كيان البلاطة =====
class Tile {
  constructor(x, y, size, char, duration, isDouble, weight) {
    this.x        = x;
    this.y        = y;
    this.size     = size;
    this.char     = char;
    this.duration = duration;
    this.elapsed  = 0;
    this.isDouble = isDouble;
    this.weight   = weight;
    this.state    = 'alive';   // alive | collecting | exploding | empty
    this._anim    = 0;
    this._spawn   = 0;         // 0→1 spawn scale animation
  }

  get progress()  { return Math.min(1, this.elapsed / this.duration); }
  get isAlive()   { return this.state === 'alive'; }
  get isDone()    { return this.state === 'empty'; }

  collect() {
    if (this.state !== 'alive') return false;
    this.state = 'collecting';
    this._anim = 0;
    return true;
  }

  tick(dt) {
    // Spawn animation
    if (this._spawn < 1) this._spawn = Math.min(1, this._spawn + dt / 200);

    if (this.state === 'alive') {
      this.elapsed += dt;
      if (this.elapsed >= this.duration) {
        this.state = 'exploding';
        this._anim = 0;
      }
    } else if (this.state === 'collecting' || this.state === 'exploding') {
      this._anim = Math.min(1, this._anim + dt / 320);
      if (this._anim >= 1) this.state = 'empty';
    }
  }

  containsPoint(px, py) {
    const r = this.size * 0.44;
    return (px - this.x) ** 2 + (py - this.y) ** 2 <= r * r;
  }

  draw(ctx) {
    if (this.state === 'empty') return;

    ctx.save();
    ctx.translate(this.x, this.y);

    // Scale: spawn bounce
    let scale = this._spawn < 1
      ? this._spawn + Math.sin(this._spawn * Math.PI) * 0.15
      : 1;

    if (this.state === 'collecting') {
      scale *= (1 + this._anim * 0.6);
      ctx.globalAlpha = Math.max(0, 1 - this._anim * 1.4);
    } else if (this.state === 'exploding') {
      scale *= (1 + this._anim * 1.0);
      ctx.globalAlpha = Math.max(0, 1 - this._anim * 1.2);
    }
    ctx.scale(scale, scale);

    const r       = this.size * 0.44;
    const urgency = Math.max(0, (this.progress - 0.55) / 0.45); // 0→1 after 55%

    // اختيار الألوان
    const gold = this.isDouble;
    const rc   = Math.round(255 - urgency * 155);
    const gc   = Math.round(215 - urgency * 185);
    const fillA = 0.13 + urgency * 0.13;
    const glowA = 0.45 + urgency * 0.45;

    const fillColor = gold
      ? `rgba(0,220,130,${fillA})`
      : `rgba(255,${gc},0,${fillA})`;
    const glowColor = gold
      ? `rgba(0,255,160,${glowA})`
      : `rgba(${rc},${gc > 0 ? gc : 0},0,${glowA})`;
    const strokeColor = gold
      ? 'rgba(0,255,160,0.7)'
      : `rgba(${rc},${Math.max(0, gc)},0,0.8)`;
    const ringColor = gold ? '#00FFAA' : `rgb(${rc},${Math.max(0, gc)},0)`;

    // دائرة الخلفية
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur  = 14 + urgency * 22;
    ctx.fill();

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth   = 1.8;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    // قوس العداد — يدور عكس عقارب الساعة مع الوقت
    const remaining = 1 - this.progress;
    if (remaining > 0 && this.state === 'alive') {
      const startA = -Math.PI / 2;
      const endA   = startA + remaining * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, startA, endA);
      ctx.strokeStyle = ringColor;
      ctx.lineWidth   = 4.5;
      ctx.lineCap     = 'round';
      ctx.shadowColor = glowColor;
      ctx.shadowBlur  = 10;
      ctx.stroke();
      ctx.shadowBlur  = 0;
      ctx.lineCap     = 'butt';
    }

    // الحرف
    ctx.font         = `bold ${Math.round(r * 1.15)}px Cairo, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = gold ? '#AFFFDD' : '#FFF2AA';
    ctx.shadowColor  = gold ? 'rgba(0,255,160,0.9)' : 'rgba(255,235,60,0.9)';
    ctx.shadowBlur   = 12;
    ctx.fillText(this.char, 0, 1);
    ctx.shadowBlur   = 0;

    // قيمة الحرف
    if (this.weight > 1) {
      ctx.font = `bold ${Math.round(r * 0.28)}px Cairo, sans-serif`;
      ctx.fillStyle = '#FFD462';
      ctx.fillText(this.weight, r * 0.52, r * 0.52);
    }

    // شارة ×٢
    if (gold) {
      ctx.font      = `bold ${Math.round(r * 0.3)}px Cairo, sans-serif`;
      ctx.fillStyle = '#00FFB0';
      ctx.fillText('×٢', r * 0.58, -r * 0.58);
    }

    // انفجار
    if (this.state === 'exploding') {
      ctx.shadowBlur  = 0;
      ctx.globalAlpha = Math.max(0, (1 - this._anim) * 0.9);
      ctx.font = `${Math.round(r * 1.2 + this._anim * r)}px serif`;
      ctx.fillText('💥', 0, 0);
    }

    ctx.restore();
  }
}

// ===== اللعبة =====
export class LetterBlazeGame {
  constructor(onQuit) {
    this._onQuit  = onQuit;
    this._canvas  = document.getElementById('blaze-canvas');
    this._ctx     = this._canvas.getContext('2d');
    this._tiles   = new Array(TILE_COUNT).fill(null);
    this._timers  = new Array(TILE_COUNT).fill(0); // respawn countdown
    this._lives   = INITIAL_LIVES;
    this._score   = 0;
    this._paused  = false;
    this._running = false;
    this._rafId   = null;
    this._lastTs  = 0;
    this._museumLetters = new Set();
    this._difficulty = 'easy';
    this._resizeHandler = null;
    this._bindUI();
  }

  _bindUI() {
    document.getElementById('blaze-btn-pause')
      .addEventListener('click', () => this.togglePause());
    document.getElementById('blaze-btn-resume')
      .addEventListener('click', () => this.togglePause());
    document.getElementById('blaze-btn-restart')
      .addEventListener('click', () => this.start());
    document.getElementById('blaze-btn-quit-pause')
      .addEventListener('click', () => { this.stop(); this._onQuit(); });
    document.getElementById('blaze-btn-quit-gameover')
      .addEventListener('click', () => { this.stop(); this._onQuit(); });

    document.getElementById('blaze-difficulty-easy')
      .addEventListener('click', () => this._setDifficulty('easy'));
    document.getElementById('blaze-difficulty-hard')
      .addEventListener('click', () => this._setDifficulty('hard'));

    this._canvas.style.touchAction = 'none';
    this._canvas.addEventListener('pointerdown', e => {
      if (!this._running || this._paused) return;
      e.preventDefault();
      const rect = this._canvas.getBoundingClientRect();
      const sx = this._canvas.width  / rect.width;
      const sy = this._canvas.height / rect.height;
      const cx = (e.clientX - rect.left) * sx;
      const cy = (e.clientY - rect.top)  * sy;
      this._onTap(cx, cy);
    }, { passive: false });
  }

  _setDifficulty(mode) {
    if (!DIFFICULTY_SETTINGS[mode]) return;
    this._difficulty = mode;
    document.getElementById('blaze-difficulty-easy')
      .classList.toggle('active', mode === 'easy');
    document.getElementById('blaze-difficulty-hard')
      .classList.toggle('active', mode === 'hard');
  }

  // ===== بدء جولة =====
  start() {
    this.stop();
    this._resizeCanvas();
    this._museumLetters = getCollectedMuseumLetterSet();
    this._lives  = INITIAL_LIVES;
    this._score  = 0;
    this._paused = false;
    this._running = true;
    this._tiles  = new Array(TILE_COUNT).fill(null);
    this._timers = new Array(TILE_COUNT).fill(0);

    this._updateHudLives();
    this._updateHudScore();
    this._hideOverlay('blaze-overlay-gameover');
    this._hideOverlay('blaze-overlay-pause');

    // ابدأ بتوليد البلاطات تباعاً (لا دفعة واحدة)
    const spawnOffset = DIFFICULTY_SETTINGS[this._difficulty].spawnOffset;
    for (let i = 0; i < TILE_COUNT; i++) {
      this._timers[i] = i * spawnOffset;
    }

    this._resizeHandler = () => this._resizeCanvas();
    window.addEventListener('resize', this._resizeHandler);
    this._lastTs = performance.now();
    this._lettersCollectedThisRun = 0;
    recordPlayStart('letter-blaze');
    this._loop();
  }

  // ===== إيقاف كامل =====
  stop() {
    this._running = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
  }

  togglePause() {
    if (!this._running) return;
    this._paused = !this._paused;
    if (this._paused) {
      if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
      this._showOverlay('blaze-overlay-pause');
    } else {
      this._hideOverlay('blaze-overlay-pause');
      this._lastTs = performance.now();
      this._loop();
    }
  }

  // ===== حلقة اللعبة =====
  _loop() {
    if (!this._running || this._paused) return;
    const now = performance.now();
    const dt  = Math.min(now - this._lastTs, 50); // الحد الأقصى 50ms لتجنب القفزات
    this._lastTs = now;
    this._update(dt);
    this._draw();
    this._rafId = requestAnimationFrame(() => this._loop());
  }

  _update(dt) {
    for (let i = 0; i < TILE_COUNT; i++) {
      const tile = this._tiles[i];

      if (!tile) {
        // عداد الإعادة
        this._timers[i] -= dt;
        if (this._timers[i] <= 0) {
          this._tiles[i] = this._spawnTile(i);
          this._timers[i] = 0;
        }
        continue;
      }

      const wasAlive = tile.isAlive;
      tile.tick(dt);

      // الحرف انتهت مهلته — خسارة حياة
      if (wasAlive && tile.state === 'exploding') {
        this._loseLife();
      }

      // الأنيميشن انتهى — أفرغ الخانة وابدأ عداد الإعادة
      if (tile.isDone) {
        this._tiles[i] = null;
        this._timers[i] = RESPAWN_DELAY_MS;
      }
    }
  }

  _draw() {
    const ctx = this._ctx;
    const w   = this._canvas.width;
    const h   = this._canvas.height;

    ctx.fillStyle = '#080818';
    ctx.fillRect(0, 0, w, h);

    // خطوط الشبكة الخفيفة
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 1;
    for (let c = 1; c < COLS; c++) {
      const x = (c / COLS) * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      const y = (r / ROWS) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    for (const tile of this._tiles) {
      if (tile) tile.draw(ctx);
    }
  }

  // ===== النقر =====
  _onTap(cx, cy) {
    for (const tile of this._tiles) {
      if (!tile || !tile.isAlive) continue;
      if (tile.containsPoint(cx, cy)) {
        if (tile.collect()) {
          const mult = tile.isDouble ? 2 : 1;
          const totalCalls = tile.weight * mult;
          let totalAwarded = 0;
          for (let i = 0; i < totalCalls; i++) {
            const r = awardLetter('letter-blaze', tile.char);
            totalAwarded += r.count;
          }
          this._score += totalAwarded;
          this._updateHudScore();
          this._lettersCollectedThisRun = (this._lettersCollectedThisRun || 0) + totalAwarded;
        }
        break;
      }
    }
  }

  // ===== الحياة والنهاية =====
  _loseLife() {
    this._lives = Math.max(0, this._lives - 1);
    this._updateHudLives();
    if (this._lives === 0) setTimeout(() => this._gameOver(), 550);
  }

  _gameOver() {
    this._running = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    recordPlayEnd('letter-blaze', {
      score: this._score,
      lettersCollected: this._lettersCollectedThisRun || 0,
      won: false,
    });
    document.getElementById('blaze-final-score').textContent = this._score;
    this._showOverlay('blaze-overlay-gameover');
  }

  // ===== مساعدات =====
  _spawnTile(index) {
    const pos      = this._randomTilePos();
    const char     = ARABIC[Math.floor(Math.random() * ARABIC.length)];
    const weight   = LETTER_WEIGHTS[char] || 1;
    const settings = DIFFICULTY_SETTINGS[this._difficulty];
    const isDouble = Math.random() < settings.doubleChance || this._museumLetters.has(char);
    return new Tile(pos.x, pos.y, this._tileSize(), char, timerFor(this._score, this._difficulty), isDouble, weight);
  }

  _randomTilePos() {
    const margin = this._tileSize() * 0.75;
    const w = this._canvas.width;
    const h = this._canvas.height;
    const sz = this._tileSize();
    let attempts = 0;
    while (attempts < 50) {
      const x = margin + Math.random() * Math.max(0, w - margin * 2);
      const y = margin + Math.random() * Math.max(0, h - margin * 2);
      let overlap = false;
      for (const tile of this._tiles) {
        if (!tile) continue;
        const dx = Math.abs(tile.x - x);
        const dy = Math.abs(tile.y - y);
        if (dx < sz && dy < sz) {
          overlap = true;
          break;
        }
      }
      if (!overlap) return { x, y };
      attempts++;
    }
    // إذا فشل، أعد موقع عشوائي
    return {
      x: margin + Math.random() * Math.max(0, w - margin * 2),
      y: margin + Math.random() * Math.max(0, h - margin * 2),
    };
  }

  _tileSize() {
    return Math.min(this._canvas.width / COLS, this._canvas.height / ROWS) * 0.74;
  }

  _updateHudLives() {
    document.querySelectorAll('#blaze-hud-lives .heart').forEach((h, i) => {
      h.classList.toggle('lost', i >= this._lives);
      h.textContent = i < this._lives ? '❤️' : '🤍';
    });
  }
  _updateHudScore() {
    document.getElementById('blaze-score-value').textContent = this._score;
  }
  _showOverlay(id) { document.getElementById(id).removeAttribute('hidden'); }
  _hideOverlay(id) { document.getElementById(id).setAttribute('hidden', ''); }

  _resizeCanvas() {
    const oldW = this._canvas.width;
    const oldH = this._canvas.height;
    this._canvas.width  = this._canvas.offsetWidth  || this._canvas.clientWidth;
    this._canvas.height = this._canvas.offsetHeight || this._canvas.clientHeight;
    const sz = this._tileSize();
    this._tiles.forEach((tile) => {
      if (!tile) return;
      if (oldW > 0 && oldH > 0) {
        tile.x = tile.x * (this._canvas.width / oldW);
        tile.y = tile.y * (this._canvas.height / oldH);
      }
      tile.size = sz;
    });
  }
}
