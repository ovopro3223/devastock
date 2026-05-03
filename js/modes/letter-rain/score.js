// ===== نظام النقاط — مع الوزنية والسجل التراكمي =====
import { getCollectedMuseumLetterSet }  from '../../core/museum-storage.js';
import { awardLetter }                  from '../../core/rare-letters.js';

export class Score {
  constructor() {
    this._score        = 0;
    this._letters      = 0;
    this._museumLetters = new Set();
  }

  reset() {
    this._score        = 0;
    this._letters      = 0;
    this._museumLetters = getCollectedMuseumLetterSet();
  }

  // returns { count, special, rarity }
  addLetter(char, spawnTag = null) {
    // حرف المتحف يعطي قاعدة 2 (مضاعفة)
    const baseCount = this._museumLetters.has(char) ? 2 : 1;
    const result = awardLetter('letter-rain', char, baseCount, spawnTag);

    this._score   += result.count;
    this._letters += result.count;
    return result;
  }

  // مكافأة إضافية عند اقتناء كلمة تلقائياً (تضاعف حروفها)
  addBonus(n) {
    this._score   += n;
    this._letters += n;
  }

  getScore()        { return this._score; }
  getLettersCount() { return this._letters; }
}
