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
