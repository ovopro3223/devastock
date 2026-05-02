// ===== كازينو الأحرف 🎰 =====
import { getStock, saveLetterToStock, spendLetters, getTotalLetters } from '../../core/storage.js';
import { recordLetter } from '../../core/lifetime-storage.js';
import { playWinSound, playLoseLifeSound } from '../../core/audio.js';

// الأحرف المتاحة في الـ slot machine
const SLOT_LETTERS = ['ا', 'ب', 'ت', 'ج', 'ح', 'د', 'ر', 'س', 'ل', 'م', 'ن', 'ه'];

const SPIN_COST = 5;
const TWO_MATCH_REWARD = 25;
const THREE_MATCH_REWARD = 100;

export class CasinoGame {
  constructor() {
    this.spinning = false;
    this._setupListeners();
  }

  _setupListeners() {
    const btn = document.getElementById('casino-spin-btn');
    if (btn) {
      btn.addEventListener('click', () => this.spin());
    }
  }

  open() {
    this._refreshStock();
    this._setResult('', '');
  }

  _refreshStock() {
    const total = getTotalLetters();
    const totalEl = document.getElementById('casino-total');
    if (totalEl) totalEl.textContent = total;

    const btn = document.getElementById('casino-spin-btn');
    if (btn) {
      if (total < SPIN_COST) {
        btn.disabled = true;
        btn.textContent = 'رصيدك غير كافي';
      } else {
        btn.disabled = false;
        btn.textContent = `🎲 دوّر — تكلفة ${SPIN_COST} أحرف`;
      }
    }
  }

  _setResult(text, type) {
    const el = document.getElementById('casino-result');
    if (!el) return;
    el.textContent = text;
    el.className = 'casino-result';
    if (type) el.classList.add(`result-${type}`);
  }

  // خصم 5 أحرف عشوائية من المخزن
  _deductBet() {
    const stock = getStock();
    const available = Object.entries(stock).filter(([, n]) => n > 0);
    if (available.length === 0) return false;

    let totalAvailable = available.reduce((s, [, n]) => s + n, 0);
    if (totalAvailable < SPIN_COST) return false;

    // خصم عشوائي
    let toDeduct = SPIN_COST;
    const cost = {};
    while (toDeduct > 0) {
      const idx = Math.floor(Math.random() * available.length);
      const [char, count] = available[idx];
      if (count <= 0) {
        available.splice(idx, 1);
        continue;
      }
      cost[char] = (cost[char] || 0) + 1;
      available[idx][1]--;
      toDeduct--;
    }
    spendLetters(cost);
    return true;
  }

  // مكافأة: إضافة أحرف للمخزن
  _awardLetters(letter, count) {
    for (let i = 0; i < count; i++) {
      saveLetterToStock(letter);
      recordLetter(letter, 1);
    }
  }

  async spin() {
    if (this.spinning) return;

    // تحقق من الرصيد
    if (getTotalLetters() < SPIN_COST) {
      this._setResult('رصيدك غير كافي', 'lose');
      return;
    }

    this.spinning = true;
    this._setResult('', '');

    // خصم التكلفة
    if (!this._deductBet()) {
      this.spinning = false;
      this._setResult('فشل خصم التكلفة', 'lose');
      return;
    }
    this._refreshStock();

    // عطّل الزر
    const btn = document.getElementById('casino-spin-btn');
    if (btn) btn.disabled = true;

    // اختر النتيجة النهائية
    const finalReels = [
      SLOT_LETTERS[Math.floor(Math.random() * SLOT_LETTERS.length)],
      SLOT_LETTERS[Math.floor(Math.random() * SLOT_LETTERS.length)],
      SLOT_LETTERS[Math.floor(Math.random() * SLOT_LETTERS.length)],
    ];

    // ابدأ الدوران
    await this._animateReels(finalReels);

    // احسب النتيجة
    this._evaluate(finalReels);

    this.spinning = false;
    this._refreshStock();
  }

  async _animateReels(finalReels) {
    const reels = [
      document.getElementById('casino-reel-1'),
      document.getElementById('casino-reel-2'),
      document.getElementById('casino-reel-3'),
    ];

    // فعّل أنميشن الدوران
    reels.forEach(r => r?.classList.add('spinning'));

    // أوقف الـ reels واحد واحد
    const stopDelays = [800, 1300, 1800]; // ms

    for (let i = 0; i < 3; i++) {
      await this._sleep(stopDelays[i] - (i > 0 ? stopDelays[i - 1] : 0));
      const reel = reels[i];
      if (reel) {
        reel.classList.remove('spinning');
        reel.classList.add('stopped');
        const letterEl = reel.querySelector('.casino-reel-letter');
        if (letterEl) letterEl.textContent = finalReels[i];

        // أنميشن الإيقاف
        setTimeout(() => reel.classList.remove('stopped'), 400);
      }
    }
  }

  _evaluate(reels) {
    const [a, b, c] = reels;

    if (a === b && b === c) {
      this._awardLetters(a, THREE_MATCH_REWARD);
      this._setResult(`🎰 جاكبوت! اكسب ${THREE_MATCH_REWARD} حرف "${a}"`, 'jackpot');
      playWinSound();
      this._celebrate();
    } else if (a === b || b === c || a === c) {
      const winner = a === b ? a : (b === c ? b : a);
      this._awardLetters(winner, TWO_MATCH_REWARD);
      this._setResult(`🎁 رائع! اكسب ${TWO_MATCH_REWARD} حرف "${winner}"`, 'win');
      playWinSound();
    } else {
      this._setResult(`💸 لم يحالفك الحظ — خسرت ${SPIN_COST} أحرف`, 'lose');
      playLoseLifeSound();
    }
  }

  _celebrate() {
    // أنميشن احتفال
    const machine = document.querySelector('.casino-machine');
    if (machine) {
      machine.classList.add('jackpot-flash');
      setTimeout(() => machine.classList.remove('jackpot-flash'), 1500);
    }
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}
