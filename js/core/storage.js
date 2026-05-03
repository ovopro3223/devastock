import { getState, setState, removeState } from './app-state.js';

function load() {
  return getState('stock', {});
}

function save(stock) {
  setState('stock', stock);
}

// إضافة حرف واحد للمخزن
export function saveLetterToStock(letter) {
  const stock = load();
  stock[letter] = (stock[letter] || 0) + 1;
  save(stock);
}

// إرجاع المخزن كاملاً { 'ا': 5, 'ب': 3, ... }
export function getStock() {
  return load();
}

// إجمالي عدد الأحرف المخزّنة (تراكمي عبر الجولات)
export function getTotalLetters() {
  return Object.values(load()).reduce((sum, n) => sum + n, 0);
}

// إنفاق حروف من المخزن عند اقتناء كلمة في المتحف
export function spendLetters(cost) {
  const stock = load();
  for (const [char, n] of Object.entries(cost)) {
    stock[char] = Math.max(0, (stock[char] || 0) - n);
  }
  save(stock);
}

// هبة مجانية — كل حرف من الـ28 يصير عنده 5 (لتجربة المتحف)
export function giftStarterLetters() {
  const letters = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
  const stock   = load();
  for (const c of letters) {
    stock[c] = (stock[c] || 0) + 5;
  }
  save(stock);
}

// مسح المخزن
export function clearStock() {
  removeState('stock');
}

// ===== استخدام الحروف للنصوص =====
const ARABIC_LETTERS_SET = new Set('ابتثجحخدذرزسشصضطظعغفقكلمنهوي');

// عَدّ الأحرف العربية المطلوبة في نص ما (يتجاهل المسافات والأرقام والرموز)
export function getRequiredLettersForText(text) {
  const required = {};
  for (const char of text) {
    if (ARABIC_LETTERS_SET.has(char)) {
      required[char] = (required[char] || 0) + 1;
    }
  }
  return required;
}

// تحقق من توفر الحروف في المخزن. يرجع { ok, missing?, have?, need? }
export function canAffordText(text) {
  const required = getRequiredLettersForText(text);
  const stock = load();
  for (const [char, n] of Object.entries(required)) {
    const have = stock[char] || 0;
    if (have < n) {
      return { ok: false, missing: char, have, need: n };
    }
  }
  return { ok: true };
}

// خصم الحروف من المخزن لنص ما
export function spendForText(text) {
  const required = getRequiredLettersForText(text);
  if (Object.keys(required).length > 0) {
    spendLetters(required);
  }
  return required;
}
