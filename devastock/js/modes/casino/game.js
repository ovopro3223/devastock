// ===== كازينو الأحرف 🎰 =====
import { getStock, saveLetterToStock, spendLetters, getTotalLetters } from '../../core/storage.js';
import { recordLetter } from '../../core/lifetime-storage.js';
import { playWinSound, playLoseLifeSound } from '../../core/audio.js';
import { recordPlayStart } from '../../core/game-stats.js';
import { incrementCounter } from '../../core/achievements.js';
import { addSeasonPoints } from '../../core/seasons.js';

// أحرف الـ slot machine — مزيج عادي + نادر للجاكبوت الميجا
const COMMON_LETTERS = ['ا', 'ب', 'ت', 'ج', 'ح', 'د', 'ر', 'س', 'ل', 'م', 'ن', 'ه'];
const RARE_LETTERS   = ['ذ', 'ض', 'ظ', 'غ'];          // 3 منهم = ميجا جاكبوت

// كل العجلة تشتمل على عادي ونادر، لكن النادر بفرصة أقل
const REEL_POOL = [
  ...COMMON_LETTERS, ...COMMON_LETTERS, ...COMMON_LETTERS,
  ...RARE_LETTERS,                                           // ندرة ~10%
];

const BET_OPTIONS = [20, 50, 100, 250, 500, 1000];

// مضاعفات الجوائز (تُضرب بالرهان)
const PRIZE_MULT = {
  mega:    100,   // 3 أحرف نادرة متطابقة (مثلاً ذذذ) → bet × 100
  jackpot: 50,    // 3 أحرف عادية متطابقة → bet × 50
  double:  5,     // 2 متطابقة → bet × 5
  loss:    -1,    // خسارة الرهان كاملاً
};

export class CasinoGame {
  constructor() {
    this.spinning = false;
    this.currentBet = 20;
    this._setupListeners();
  }

  _setupListeners() {
    const spinBtn = document.getElementById('casino-spin-btn');
    if (spinBtn) spinBtn.addEventListener('click', () => this.spin());

    // أزرار الرهان
    document.querySelectorAll('.casino-bet-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bet = parseInt(btn.dataset.bet, 10);
        if (this.spinning) return;
        if (getTotalLetters() < bet) return;
        this.currentBet = bet;
        this._refreshUI();
      });
    });
  }

  open() {
    this._refreshUI();
    this._setResult('', '');
  }

  _refreshUI() {
    const total = getTotalLetters();

    // إجمالي الرصيد
    const totalEl = document.getElementById('casino-total');
    if (totalEl) totalEl.textContent = total;

    // الرهان الحالي
    const betEl = document.getElementById('casino-bet-amount');
    if (betEl) betEl.textContent = this.currentBet;

    // أزرار الرهان: تفعيل/تعطيل بناءً على الرصيد
    document.querySelectorAll('.casino-bet-btn').forEach(btn => {
      const bet = parseInt(btn.dataset.bet, 10);
      btn.disabled = total < bet;
      btn.classList.toggle('active', bet === this.currentBet);
    });

    // أعلى رهان متاح صار الـ default إذا الحالي مش ممكن
    if (total < this.currentBet) {
      const affordable = BET_OPTIONS.filter(b => b <= total);
      this.currentBet = affordable.length > 0 ? affordable[affordable.length - 1] : BET_OPTIONS[0];
      if (betEl) betEl.textContent = this.currentBet;
      document.querySelectorAll('.casino-bet-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.bet, 10) === this.currentBet);
      });
    }

    // الجوائز المحتملة (تتحدث مع الرهان)
    const megaEl = document.getElementById('casino-prize-mega');
    const jackEl = document.getElementById('casino-prize-jackpot');
    const dblEl  = document.getElementById('casino-prize-double');
    if (megaEl) megaEl.textContent = `+${this.currentBet * PRIZE_MULT.mega} حرف`;
    if (jackEl) jackEl.textContent = `+${this.currentBet * PRIZE_MULT.jackpot} حرف`;
    if (dblEl)  dblEl.textContent  = `+${this.currentBet * PRIZE_MULT.double} حرف`;

    // زر الدوران
    const spinBtn = document.getElementById('casino-spin-btn');
    if (spinBtn) {
      if (total < this.currentBet) {
        spinBtn.disabled = true;
        spinBtn.textContent = 'رصيدك غير كافي';
      } else {
        spinBtn.disabled = false;
        spinBtn.textContent = `🎲 دوّر — راهن ${this.currentBet} حرف`;
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

  // خصم رهان عشوائي من المخزن
  _deductBet(amount) {
    const stock = getStock();
    const available = Object.entries(stock).filter(([, n]) => n > 0);
    const totalAvailable = available.reduce((s, [, n]) => s + n, 0);
    if (totalAvailable < amount) return false;

    let toDeduct = amount;
    const cost = {};
    while (toDeduct > 0 && available.length > 0) {
      const idx = Math.floor(Math.random() * available.length);
      const [char, count] = available[idx];
      if (count <= 0) { available.splice(idx, 1); continue; }
      cost[char] = (cost[char] || 0) + 1;
      available[idx][1]--;
      toDeduct--;
    }
    spendLetters(cost);
    return true;
  }

  _awardLetters(letter, count) {
    for (let i = 0; i < count; i++) {
      saveLetterToStock(letter);
      recordLetter(letter, 1);
    }
  }

  async spin() {
    if (this.spinning) return;
    if (getTotalLetters() < this.currentBet) {
      this._setResult('رصيدك غير كافي', 'lose');
      return;
    }

    this.spinning = true;
    this._setResult('', '');
    recordPlayStart('casino');

    if (!this._deductBet(this.currentBet)) {
      this.spinning = false;
      this._setResult('فشل خصم الرهان', 'lose');
      return;
    }
    this._refreshUI();

    // عطّل الزر
    const btn = document.getElementById('casino-spin-btn');
    if (btn) btn.disabled = true;

    // اختر النتيجة النهائية من الـ pool
    const finalReels = [
      REEL_POOL[Math.floor(Math.random() * REEL_POOL.length)],
      REEL_POOL[Math.floor(Math.random() * REEL_POOL.length)],
      REEL_POOL[Math.floor(Math.random() * REEL_POOL.length)],
    ];

    await this._animateReels(finalReels);
    this._evaluate(finalReels);

    this.spinning = false;
    this._refreshUI();
  }

  async _animateReels(finalReels) {
    const reels = [
      document.getElementById('casino-reel-1'),
      document.getElementById('casino-reel-2'),
      document.getElementById('casino-reel-3'),
    ];

    reels.forEach(r => r?.classList.add('spinning'));
    const stopDelays = [800, 1300, 1800];

    for (let i = 0; i < 3; i++) {
      await this._sleep(stopDelays[i] - (i > 0 ? stopDelays[i - 1] : 0));
      const reel = reels[i];
      if (reel) {
        reel.classList.remove('spinning');
        reel.classList.add('stopped');
        const letterEl = reel.querySelector('.casino-reel-letter');
        if (letterEl) letterEl.textContent = finalReels[i];
        setTimeout(() => reel.classList.remove('stopped'), 400);
      }
    }
  }

  _evaluate(reels) {
    const [a, b, c] = reels;
    const allRare = RARE_LETTERS.includes(a) && RARE_LETTERS.includes(b) && RARE_LETTERS.includes(c);

    if (a === b && b === c) {
      // ميجا جاكبوت إذا الكل نادر متطابق، عادي إذا غير
      const isMega = RARE_LETTERS.includes(a);
      const mult = isMega ? PRIZE_MULT.mega : PRIZE_MULT.jackpot;
      const reward = this.currentBet * mult;
      this._awardLetters(a, reward);
      incrementCounter('casino_triples');
      addSeasonPoints(isMega ? 500 : 150);

      if (isMega) {
        this._setResult(`💎 ميجا جاكبوت! اكسب ${reward} حرف "${a}"`, 'jackpot');
      } else {
        this._setResult(`🎰 جاكبوت! اكسب ${reward} حرف "${a}"`, 'jackpot');
      }
      playWinSound();
      this._celebrate(isMega);
    } else if (a === b || b === c || a === c) {
      const winner = a === b ? a : (b === c ? b : a);
      const reward = this.currentBet * PRIZE_MULT.double;
      this._awardLetters(winner, reward);
      addSeasonPoints(Math.round(this.currentBet / 4));
      this._setResult(`🎁 رائع! اكسب ${reward} حرف "${winner}"`, 'win');
      playWinSound();
    } else {
      // الخسارة = الرهان (تم خصمه أصلاً)
      this._setResult(`💸 لم يحالفك الحظ — خسرت ${this.currentBet} حرف`, 'lose');
      playLoseLifeSound();
    }
  }

  _celebrate(isMega = false) {
    const machine = document.querySelector('.casino-machine');
    if (machine) {
      machine.classList.add('jackpot-flash');
      if (isMega) machine.classList.add('mega-flash');
      setTimeout(() => {
        machine.classList.remove('jackpot-flash');
        machine.classList.remove('mega-flash');
      }, isMega ? 2500 : 1500);
    }
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}
