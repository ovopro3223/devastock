// ===== نظام النقاط — مع الوزنية والسجل التراكمي =====
import { saveLetterToStock }            from '../../core/storage.js';
import { recordLetter }                 from '../../core/lifetime-storage.js';
import { getCollectedMuseumLetterSet }  from '../../core/museum-storage.js';

export class Score {
  constructor() {
    this._score        = 0;
    this._letters      = 0;
    this._museumLetters = new Set();
  }

  // يُستدعى عند بدء جولة جديدة — يحدّث مجموعة الحروف المضاعفة
  reset() {
    this._score        = 0;
    this._letters      = 0;
    this._museumLetters = getCollectedMuseumLetterSet();
  }

  // يُستدعى عند التقاط حرف — يُرجع 1 أو 2 (المضاعف)
  addLetter(char) {
    const mult = this._museumLetters.has(char) ? 2 : 1;

    this._score   += mult;
    this._letters += mult;

    // أضف للمخزن الحالي
    saveLetterToStock(char);
    if (mult === 2) saveLetterToStock(char); // مرة ثانية إذا مضاعف

    // سجّل في التاريخ التراكمي
    recordLetter(char, mult);

    return mult;
  }

  // مكافأة إضافية عند اقتناء كلمة تلقائياً (تضاعف حروفها)
  addBonus(n) {
    this._score   += n;
    this._letters += n;
  }

  getScore()        { return this._score; }
  getLettersCount() { return this._letters; }
}
