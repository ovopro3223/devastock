// ===== كلاسات الكيانات: Letter, Bomb, Snowflake =====
import { LETTER_RAIN_CONFIG as CFG } from '../../core/config.js';

const ARABIC_LETTERS = [
  'ا','ب','ت','ث','ج','ح','خ',
  'د','ذ','ر','ز','س','ش','ص',
  'ض','ط','ظ','ع','غ','ف','ق',
  'ك','ل','م','ن','ه','و','ي',
];

// ===== الحرف =====
export class Letter {
  constructor(canvasWidth) {
    this.type  = 'letter';
    this.size  = CFG.ENTITY_SIZE;
    this.char  = ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
    this.x     = this.size / 2 + Math.random() * (canvasWidth - this.size);
    this.y     = -this.size;
    this.speed = CFG.LETTER_FALL_SPEED_MIN +
                 Math.random() * (CFG.LETTER_FALL_SPEED_MAX - CFG.LETTER_FALL_SPEED_MIN);
    this.alive     = true;
    this.collected = false;
    this._anim     = 0;
    this._double   = false; // تُضبط من الخارج إذا كانت مضاعفة
    this.rarity    = 'common';
    this.special   = null;  // 'golden' | 'rainbow' | null
    this.spawnTag  = null;
  }

  _specialColors() {
    if (this.special === 'rainbow') {
      const t = (Date.now() / 200) % 360;
      const c = `hsl(${t}, 90%, 70%)`;
      return { glow: c, stroke: c, fill: '#FFFFFF', textGlow: c };
    }
    if (this.special === 'golden') {
      return { glow: 'rgba(255,200,0,1)', stroke: '#FFD700', fill: '#FFF8B0', textGlow: 'rgba(255,200,50,1)' };
    }
    if (this.rarity === 'epic') {
      return { glow: 'rgba(255,107,157,0.9)', stroke: '#FF6B9D', fill: '#FFD8E5', textGlow: 'rgba(255,107,157,0.95)' };
    }
    if (this.rarity === 'rare') {
      return { glow: 'rgba(155,107,255,0.85)', stroke: '#9B6BFF', fill: '#E0D0FF', textGlow: 'rgba(155,107,255,0.95)' };
    }
    if (this.rarity === 'uncommon') {
      return { glow: 'rgba(93,211,211,0.8)', stroke: '#5DD3D3', fill: '#D0FFFF', textGlow: 'rgba(93,211,211,0.95)' };
    }
    return null;
  }

  update(frozen) {
    if (!frozen && !this.collected) this.y += this.speed;
    if (this.collected) {
      this._anim += 0.1;
      if (this._anim >= 1) this.alive = false;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.collected) {
      ctx.globalAlpha = Math.max(0, 1 - this._anim);
      ctx.scale(1 + this._anim * 0.9, 1 + this._anim * 0.9);
    }

    const r  = this.size * 0.66;
    const ty = -r * 1.55;   // نقطة الرأس

    // ── رسم شكل قطرة الماء ──
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.bezierCurveTo( r * 0.92, ty * 0.45,  r,       r * 0.32,  0,  r);
    ctx.bezierCurveTo(-r,        r * 0.32, -r * 0.92, ty * 0.45,  0, ty);
    ctx.closePath();

    const sc = this._specialColors();
    // توهج خارجي
    ctx.shadowColor = sc ? sc.glow : (this._double ? 'rgba(0,255,160,0.80)' : 'rgba(255,210,0,0.75)');
    ctx.shadowBlur  = sc && (this.special) ? 30 : 22;

    // تعبئة شفافة كقطرة ماء
    const cx  = -r * 0.18;
    const cy  =  r * 0.10;
    const grad = ctx.createRadialGradient(cx, cy - r * 0.6, r * 0.05, cx, cy, r * 1.4);
    if (this._double) {
      grad.addColorStop(0,   'rgba(200,255,230,0.38)');
      grad.addColorStop(0.5, 'rgba(0,220,130,0.18)');
      grad.addColorStop(1,   'rgba(0,100,60,0.05)');
    } else {
      grad.addColorStop(0,   'rgba(255,252,210,0.35)');
      grad.addColorStop(0.5, 'rgba(255,215,0,0.18)');
      grad.addColorStop(1,   'rgba(180,100,0,0.05)');
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // حافة رقيقة
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = sc ? sc.stroke : (this._double ? 'rgba(0,255,150,0.85)' : 'rgba(255,215,0,0.80)');
    ctx.lineWidth   = this.special ? 2.4 : 1.6;
    ctx.stroke();

    // بريق صغير (انعكاس الضوء)
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, ty * 0.6, r * 0.14, r * 0.08, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.50)';
    ctx.fill();

    // بريق ثانوي جانبي
    ctx.beginPath();
    ctx.ellipse(-r * 0.38, r * 0.05, r * 0.07, r * 0.18, 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();

    // الحرف
    ctx.shadowColor  = this._double ? 'rgba(0,255,160,0.95)' : 'rgba(255,235,60,0.95)';
    ctx.shadowBlur   = 13;
    ctx.font         = `bold ${Math.round(this.size * 0.62)}px Cairo, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = this._double ? '#AFFFDD' : '#FFF2AA';
    ctx.fillText(this.char, 0, r * 0.08);

    // علامة ×٢ إذا كانت مضاعفة
    if (this._double) {
      ctx.font      = `bold ${Math.round(this.size * 0.28)}px Cairo, sans-serif`;
      ctx.fillStyle = '#00FFB0';
      ctx.shadowBlur = 6;
      ctx.fillText('×٢', r * 0.52, ty * 0.7);
    }

    // علامة special ×3 / ×5
    if (this.special === 'golden') {
      ctx.font      = `bold ${Math.round(this.size * 0.28)}px Cairo, sans-serif`;
      ctx.fillStyle = '#FFD700';
      ctx.shadowColor = 'rgba(255,200,0,1)';
      ctx.shadowBlur = 8;
      ctx.fillText('×3', -r * 0.55, ty * 0.7);
    } else if (this.special === 'rainbow') {
      ctx.font      = `bold ${Math.round(this.size * 0.32)}px Cairo, sans-serif`;
      const t = (Date.now() / 200) % 360;
      ctx.fillStyle = `hsl(${t}, 90%, 70%)`;
      ctx.shadowColor = `hsl(${t}, 90%, 70%)`;
      ctx.shadowBlur = 10;
      ctx.fillText('×5', -r * 0.55, ty * 0.7);
    }

    ctx.restore();
  }

  isOffScreen(h) { return this.y > h + this.size; }
}

// ===== القنبلة =====
export class Bomb {
  constructor(canvasWidth) {
    this.type  = 'bomb';
    this.size  = CFG.ENTITY_SIZE;
    this.x     = this.size / 2 + Math.random() * (canvasWidth - this.size);
    this.y     = -this.size;
    this.speed = CFG.LETTER_FALL_SPEED_MIN +
                 Math.random() * (CFG.LETTER_FALL_SPEED_MAX - CFG.LETTER_FALL_SPEED_MIN);
    this.alive  = true;
    this.wasHit = false;
    this._anim  = 0;
  }

  update(frozen) {
    if (!frozen && !this.wasHit) this.y += this.speed;
    if (this.wasHit) {
      this._anim += 0.1;
      if (this._anim >= 1) this.alive = false;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.wasHit) {
      ctx.globalAlpha = Math.max(0, 1 - this._anim);
      ctx.scale(1 + this._anim * 2, 1 + this._anim * 2);
    }

    ctx.font = `${this.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CFG.BOMB_EMOJI, 0, 0);
    ctx.restore();
  }

  isOffScreen(h) { return this.y > h + this.size; }
}

// ===== الثلجة =====
export class Snowflake {
  constructor(canvasWidth) {
    this.type  = 'snowflake';
    this.size  = CFG.ENTITY_SIZE;
    this.x     = this.size / 2 + Math.random() * (canvasWidth - this.size);
    this.y     = -this.size;
    // الثلجة أبطأ قليلاً
    this.speed = CFG.LETTER_FALL_SPEED_MIN * 0.65 +
                 Math.random() * (CFG.LETTER_FALL_SPEED_MAX * 0.65 - CFG.LETTER_FALL_SPEED_MIN * 0.65);
    this.alive     = true;
    this.collected = false;
    this._anim     = 0;
    this._rot      = 0;
    this._rotSpeed = (Math.random() - 0.5) * 0.04;
  }

  update(frozen) {
    if (!frozen && !this.collected) {
      this.y   += this.speed;
      this._rot += this._rotSpeed;
    }
    if (this.collected) {
      this._anim += 0.09;
      if (this._anim >= 1) this.alive = false;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this._rot);

    if (this.collected) {
      ctx.globalAlpha = Math.max(0, 1 - this._anim);
      ctx.scale(1 + this._anim * 1.3, 1 + this._anim * 1.3);
    }

    ctx.shadowColor = CFG.SNOWFLAKE_GLOW;
    ctx.shadowBlur  = 18;
    ctx.font = `${this.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CFG.SNOWFLAKE_EMOJI, 0, 0);
    ctx.restore();
  }

  isOffScreen(h) { return this.y > h + this.size; }
}
