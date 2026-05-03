// ===== نظام النقاط — مع الوزنية والسجل التراكمي =====
import { saveLetterToStock }            from '../../core/storage.js';
import { recordLetter }                 from '../../core/lifetime-storage.js';
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
    const result = awardLetter('letter-rain', char, spawnTag);

    // حروف المتحف ×2 إضافي
    if (this._museumLetters.has(char)) {
      const extra = result.count;
      for (let i = 0; i < extra; i++) {
        saveLetterToStock(char);
        recordLetter(char, 1);
      }
      result.count *= 2;
    }

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
