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
const NUM_REELS = 6;

// مضاعفات الجوائز (تُضرب بالرهان) — حسب عدد التكرارات لأكثر حرف
// الاحتمالات ~ 6:0.0001%، 5:0.01%، 4:1.7%، 3:13%، 2:52%، 0:34%
const PRIZE_MULT = {
  6: 500,   // كوزمي — جدّاً نادر
  5: 100,   // سوبر جاكبوت
  4: 20,    // جاكبوت كبير
  3: 4,     // جاكبوت — يحدث ~13%
  2: 1,     // استرداد الرهان فقط (شائع 52%)
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

    // شريط الرهان
    const slider = document.getElementById('casino-bet-slider');
    if (slider) {
      slider.addEventListener('input', () => {
        if (this.spinning) return;
        const idx = parseInt(slider.value, 10);
        const bet = BET_OPTIONS[Math.max(0, Math.min(BET_OPTIONS.length - 1, idx))];
        // إذا الرصيد ما يكفي، خفض للأعلى متاح
        const total = getTotalLetters();
        if (total < bet) {
          const maxIdx = BET_OPTIONS.findIndex(b => b > total);
          const safeIdx = maxIdx === -1 ? BET_OPTIONS.length - 1 : Math.max(0, maxIdx - 1);
          slider.value = String(safeIdx);
          this.currentBet = BET_OPTIONS[safeIdx];
        } else {
          this.currentBet = bet;
        }
        this._refreshUI();
      });
    }
  }

  open() {
    this._refreshUI();
    this._setResult('', '');
  }

  _refreshUI() {
    const total = getTotalLetters();

    // إذا الرهان الحالي أعلى من الرصيد، خفّض للأعلى متاح
    if (total < this.currentBet) {
      const affordable = BET_OPTIONS.filter(b => b <= total);
      this.currentBet = affordable.length > 0 ? affordable[affordable.length - 1] : BET_OPTIONS[0];
    }

    // إجمالي الرصيد
    const totalEl = document.getElementById('casino-total');
    if (totalEl) totalEl.textContent = total;

    // الرهان الحالي + الشريط
    const betEl = document.getElementById('casino-bet-amount');
    if (betEl) betEl.textContent = this.currentBet;

    const slider = document.getElementById('casino-bet-slider');
    if (slider) {
      const idx = BET_OPTIONS.indexOf(this.currentBet);
      slider.value = String(idx >= 0 ? idx : 0);
      // اطبع نسبة التعبئة (للون الشريط)
      const fillPct = (idx / (BET_OPTIONS.length - 1)) * 100;
      slider.style.setProperty('--fill', `${fillPct}%`);
    }

    // الجوائز المحتملة (تتحدث مع الرهان)
    for (const k of [6, 5, 4, 3, 2]) {
      const el = document.getElementById(`casino-prize-${k}`);
      if (el) el.textContent = `+${this.currentBet * PRIZE_MULT[k]} حرف`;
    }

    // زر الدوران
    const spinBtn = document.getElementById('casino-spin-btn');
    if (spinBtn) {
      if (total < this.currentBet || total < BET_OPTIONS[0]) {
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
    // الحرف يُضاف للمخزن كاملاً (يقدر يستخدمه)
    for (let i = 0; i < count; i++) {
      saveLetterToStock(letter);
    }
    // الخبرة (lifetime) من الكازينو 10% فقط — ما يقدر يفرّخ levels من الكازينو
    const xpCount = Math.floor(count * 0.1);
    if (xpCount > 0) recordLetter(letter, xpCount);
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

    // اختر النتيجة النهائية من الـ pool لكل خانة
    const finalReels = [];
    for (let i = 0; i < NUM_REELS; i++) {
      finalReels.push(REEL_POOL[Math.floor(Math.random() * REEL_POOL.length)]);
    }

    await this._animateReels(finalReels);
    this._evaluate(finalReels);

    this.spinning = false;
    this._refreshUI();
  }

  async _animateReels(finalReels) {
    const reels = [];
    for (let i = 1; i <= NUM_REELS; i++) {
      reels.push(document.getElementById(`casino-reel-${i}`));
    }

    reels.forEach(r => r?.classList.add('spinning'));
    // كل خانة توقف بعد 300ms من اللي قبلها
    const baseDelay = 700;
    const step = 250;
    const stopDelays = reels.map((_, i) => baseDelay + i * step);

    for (let i = 0; i < NUM_REELS; i++) {
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
    // عدّ تكرار كل حرف، اختر الأعلى
    const counts = {};
    for (const c of reels) counts[c] = (counts[c] || 0) + 1;
    let topChar = reels[0];
    let topCount = 0;
    for (const [char, n] of Object.entries(counts)) {
      if (n > topCount) { topCount = n; topChar = char; }
    }

    if (topCount >= 2) {
      const mult = PRIZE_MULT[topCount];
      const reward = this.currentBet * mult;
      this._awardLetters(topChar, reward);

      // إنجازات + season
      if (topCount >= 3) {
        incrementCounter('casino_triples');
        addSeasonPoints(50 * topCount);
      } else {
        addSeasonPoints(Math.round(this.currentBet / 4));
      }

      const labels = {
        6: '🌌 كوزمي!',
        5: '💎 سوبر جاكبوت!',
        4: '🎰 جاكبوت كبير!',
        3: '🎯 جاكبوت!',
        2: '🎁 رائع!',
      };
      this._setResult(`${labels[topCount]} اكسب ${reward} حرف "${topChar}"`, topCount >= 3 ? 'jackpot' : 'win');
      playWinSound();
      this._celebrate(topCount);
    } else {
      this._setResult(`💸 لم يحالفك الحظ — خسرت ${this.currentBet} حرف`, 'lose');
      playLoseLifeSound();
    }
  }

  _celebrate(matchCount) {
    const machine = document.querySelector('.casino-machine');
    if (!machine) return;
    machine.classList.add('jackpot-flash');
    let duration = 1500;
    if (matchCount >= 6) {
      machine.classList.add('cosmic-flash');
      duration = 3500;
    } else if (matchCount >= 5) {
      machine.classList.add('mega-flash');
      duration = 2500;
    } else if (matchCount >= 4) {
      machine.classList.add('mega-flash');
      duration = 2000;
    }
    setTimeout(() => {
      machine.classList.remove('jackpot-flash');
      machine.classList.remove('mega-flash');
      machine.classList.remove('cosmic-flash');
    }, duration);
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}
