// ===== توليد الكيانات — نظام الحزمة الدوارة + تجنب التصادم =====
import { Letter, Bomb, Snowflake } from './entities.js';
import { LETTER_RAIN_CONFIG as CFG } from '../../core/config.js';

const ARABIC_LETTERS = [
  'ا','ب','ت','ث','ج','ح','خ',
  'د','ذ','ر','ز','س','ش','ص',
  'ض','ط','ظ','ع','غ','ف','ق',
  'ك','ل','م','ن','ه','و','ي',
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Spawner {
  constructor() {
    this._frame = 0;
    this._deck  = shuffle(ARABIC_LETTERS);
    this._di    = 0;
  }

  reset() {
    this._frame = 0;
    this._deck  = shuffle(ARABIC_LETTERS);
    this._di    = 0;
  }

  // الحرف التالي من الحزمة الدوارة — يضمن ظهور كل الـ28 في كل دورة
  _nextChar() {
    if (this._di >= this._deck.length) {
      this._deck = shuffle(ARABIC_LETTERS);
      this._di   = 0;
    }
    return this._deck[this._di++];
  }

  // إيجاد x آمن بعيد عن الكيانات القريبة من أعلى الشاشة
  _safeX(canvasWidth, entities) {
    const minD    = CFG.SPAWN_SAFE_DIST;
    const pad     = CFG.ENTITY_SIZE * 0.7;
    const topZone = entities.filter(e => e.y < 320);

    for (let i = 0; i < 25; i++) {
      const x  = pad + Math.random() * (canvasWidth - pad * 2);
      const ok = topZone.every(e => Math.abs(e.x - x) >= minD);
      if (ok) return x;
    }
    return pad + Math.random() * (canvasWidth - pad * 2);
  }

  // يُستدعى كل frame — يُرجع كيانًا جديدًا أو null
  tick(canvasWidth, entities = []) {
    this._frame++;
    if (this._frame < CFG.LETTER_SPAWN_RATE) return null;
    this._frame = 0;

    const x    = this._safeX(canvasWidth, entities);
    const roll = Math.random();

    if (roll < CFG.SNOWFLAKE_SPAWN_PROBABILITY) {
      const sf = new Snowflake(canvasWidth);
      sf.x = x;
      return sf;
    }
    if (roll < CFG.SNOWFLAKE_SPAWN_PROBABILITY + CFG.BOMB_SPAWN_PROBABILITY) {
      const b = new Bomb(canvasWidth);
      b.x = x;
      return b;
    }

    const letter  = new Letter(canvasWidth);
    letter.x      = x;
    letter.char   = this._nextChar();
    return letter;
  }
}
