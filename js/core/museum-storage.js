// ===== حفظ تقدم المتحف =====
import { MUSEUM_CATEGORIES, getLetterCost, canAfford } from './museum-data.js';
import { getStock, spendLetters } from './storage.js';
import { getState, setState } from './app-state.js';

function load() {
  return getState('museum', {});
}

function save(d) { setState('museum', d); }

// هل الكلمة مقتناة؟
export function isCollected(catId, word) {
  return (load()[catId] ?? []).includes(word);
}

// اقتناء كلمة
export function collectWord(catId, word) {
  const d = load();
  if (!d[catId]) d[catId] = [];
  if (!d[catId].includes(word)) d[catId].push(word);
  save(d);
}

// تقدم فئة معينة: { collected: N, total: M }
export function getCategoryProgress(catId, totalWords) {
  return {
    collected: (load()[catId] ?? []).length,
    total:     totalWords,
  };
}

// إجمالي المقتنيات عبر كل الفئات
export function getTotalCollected() {
  const d = load();
  return Object.values(d).reduce((s, arr) => s + arr.length, 0);
}

// اقتناء تلقائي: جرّب كل كلمة غير مقتناة — اقتنِ كل ما يمكن الآن
// يُرجع مصفوفة { word, icon, label } لكل كلمة تم اقتناؤها
export function tryAutoCollectAll() {
  const results = [];
  let changed = true;
  while (changed) {
    changed = false;
    const stock = getStock();
    outer:
    for (const cat of MUSEUM_CATEGORIES) {
      for (const word of cat.words) {
        if (isCollected(cat.id, word)) continue;
        if (!canAfford(word, stock)) continue;
        const cost = getLetterCost(word);
        const bonus = Object.values(cost).reduce((s, n) => s + n, 0);
        spendLetters(cost);
        collectWord(cat.id, word);
        results.push({ word, icon: cat.icon, label: cat.label, bonus });
        changed = true;
        break outer; // أعد المسح بمخزون محدّث
      }
    }
  }
  return results;
}

// مجموعة الحروف الموجودة في الكلمات المقتناة (للمضاعفة في اللعبة)
export function getCollectedMuseumLetterSet() {
  const NORM  = { 'أ':'ا','إ':'ا','آ':'ا','ٱ':'ا','ة':'ه','ى':'ي' };
  const VALID = new Set('ابتثجحخدذرزسشصضطظعغفقكلمنهوي');
  const set   = new Set();
  const data  = load();
  for (const wordList of Object.values(data)) {
    for (const word of wordList) {
      for (const char of word) {
        const c = NORM[char] ?? char;
        if (VALID.has(c)) set.add(c);
      }
    }
  }
  return set;
}
