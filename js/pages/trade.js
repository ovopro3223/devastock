// ===== متجر تبديل الأحرف =====
import { getStock, saveLetterToStock, spendLetters } from '../core/storage.js';
import { recordLetter } from '../core/lifetime-storage.js';

const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split('');
const TRADE_RATIO = 5;   // 5 من المصدر = 1 من الهدف

let _initialized = false;
let _fromLetter = null;
let _toLetter = null;
let _amount = TRADE_RATIO; // مضاعفات 5

export function initTrade() {
  if (_initialized) return;
  _initialized = true;

  const slider = document.getElementById('trade-amount-slider');
  if (slider) {
    slider.addEventListener('input', () => {
      _amount = Math.max(TRADE_RATIO, parseInt(slider.value, 10) || TRADE_RATIO);
      // تقريب لأقرب مضاعف من 5
      _amount = Math.floor(_amount / TRADE_RATIO) * TRADE_RATIO;
      _renderPreview();
    });
  }

  const confirmBtn = document.getElementById('trade-confirm-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => _executeTrade());
  }

  document.addEventListener('page-show', (e) => {
    if (e.detail === 'trade') renderTrade();
  });
}

export function renderTrade() {
  _renderFromList();
  _renderToList();
  _renderPreview();
}

function _renderFromList() {
  const container = document.getElementById('trade-from-list');
  if (!container) return;
  const stock = getStock();

  // الأحرف اللي عند المستخدم منها 5 على الأقل
  const owned = ARABIC_LETTERS
    .map(c => ({ char: c, count: stock[c] || 0 }))
    .filter(item => item.count >= TRADE_RATIO);

  if (owned.length === 0) {
    container.innerHTML = `<div class="trade-empty">لا توجد أحرف كافية للتبديل (تحتاج ${TRADE_RATIO} على الأقل من حرف).</div>`;
    _fromLetter = null;
    return;
  }

  // إذا الـ from الحالي مش متاح، اختر الأول
  if (!_fromLetter || !owned.find(o => o.char === _fromLetter)) {
    _fromLetter = owned[0].char;
  }

  container.innerHTML = owned.map(item => {
    const active = item.char === _fromLetter;
    return `
      <button class="trade-letter-chip ${active ? 'active' : ''}" data-char="${item.char}" data-side="from">
        <span class="trade-letter-char">${item.char}</span>
        <span class="trade-letter-count">${item.count}</span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.trade-letter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      _fromLetter = btn.dataset.char;
      // تقليل الكمية لو أكبر من المتاح
      const max = (stock[_fromLetter] || 0);
      const safeMax = Math.floor(max / TRADE_RATIO) * TRADE_RATIO;
      if (_amount > safeMax) _amount = safeMax || TRADE_RATIO;
      _renderFromList();
      _updateSliderRange();
      _renderPreview();
    });
  });

  _updateSliderRange();
}

function _renderToList() {
  const container = document.getElementById('trade-to-list');
  if (!container) return;

  // كل الـ 28 حرف متاحة كـ هدف (لكن استبعد الـ from)
  const choices = ARABIC_LETTERS.filter(c => c !== _fromLetter);

  if (!_toLetter || _toLetter === _fromLetter) {
    _toLetter = choices[0];
  }

  container.innerHTML = choices.map(c => {
    const active = c === _toLetter;
    return `
      <button class="trade-letter-chip target ${active ? 'active' : ''}" data-char="${c}" data-side="to">
        <span class="trade-letter-char">${c}</span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.trade-letter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      _toLetter = btn.dataset.char;
      _renderToList();
      _renderPreview();
    });
  });
}

function _updateSliderRange() {
  const slider = document.getElementById('trade-amount-slider');
  if (!slider) return;
  const stock = getStock();
  const max = _fromLetter ? (stock[_fromLetter] || 0) : 0;
  const safeMax = Math.max(TRADE_RATIO, Math.floor(max / TRADE_RATIO) * TRADE_RATIO);
  slider.min = TRADE_RATIO;
  slider.max = safeMax;
  slider.step = TRADE_RATIO;
  if (_amount > safeMax) _amount = safeMax;
  if (_amount < TRADE_RATIO) _amount = TRADE_RATIO;
  slider.value = String(_amount);
}

function _renderPreview() {
  const fromCharEl = document.getElementById('trade-from-char');
  const fromCountEl = document.getElementById('trade-from-count');
  const toCharEl = document.getElementById('trade-to-char');
  const toCountEl = document.getElementById('trade-to-count');
  const amountLabelEl = document.getElementById('trade-amount-label');
  const confirmBtn = document.getElementById('trade-confirm-btn');

  const stock = getStock();
  const fromAvailable = _fromLetter ? (stock[_fromLetter] || 0) : 0;
  const targetAmount = Math.floor(_amount / TRADE_RATIO);

  if (fromCharEl) fromCharEl.textContent = _fromLetter || '—';
  if (fromCountEl) fromCountEl.textContent = `${_amount}`;
  if (toCharEl) toCharEl.textContent = _toLetter || '—';
  if (toCountEl) toCountEl.textContent = `${targetAmount}`;
  if (amountLabelEl) amountLabelEl.textContent = `${_amount} حرف`;

  if (confirmBtn) {
    const valid = _fromLetter && _toLetter && _fromLetter !== _toLetter && _amount >= TRADE_RATIO && fromAvailable >= _amount;
    confirmBtn.disabled = !valid;
    confirmBtn.textContent = valid
      ? `بدّل ${_amount}× ${_fromLetter} ← ${targetAmount}× ${_toLetter}`
      : 'اختر حرفين وكمية';
  }

  // تحديث القيمة على الـ slider + تعبئة بصرية
  const slider = document.getElementById('trade-amount-slider');
  if (slider) {
    if (parseInt(slider.value, 10) !== _amount) slider.value = String(_amount);
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 1;
    const pct = max > min ? ((_amount - min) / (max - min)) * 100 : 0;
    slider.style.setProperty('--fill', `${pct}%`);
  }
}

function _executeTrade() {
  if (!_fromLetter || !_toLetter || _fromLetter === _toLetter) return;
  const stock = getStock();
  if ((stock[_fromLetter] || 0) < _amount) {
    alert('رصيدك غير كافي');
    return;
  }
  const target = Math.floor(_amount / TRADE_RATIO);
  if (target <= 0) return;

  spendLetters({ [_fromLetter]: _amount });
  for (let i = 0; i < target; i++) {
    saveLetterToStock(_toLetter);
    // ملاحظة: ما نضيفها لـ lifetime لأنها تبديل، مش تجميع
  }

  alert(`✅ تم التبديل: ${_amount}× ${_fromLetter} → ${target}× ${_toLetter}`);
  renderTrade();
}
