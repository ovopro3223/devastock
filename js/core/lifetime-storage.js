import { getState, setState } from './app-state.js';
import { getStock } from './storage.js';

function load() {
  return getState('lifetime', {});
}
function save(d) { setState('lifetime', d); }

// مزامنة lifetime مع stock — لو في حروف بالمخزن أكثر مما هو مسجل بـ lifetime
// (يحدث لو المستخدم جمع حروف قبل ما ينضاف نظام lifetime، أو لو سحب من السحابة بيانات قديمة)
// اللفل لازم يعكس الأقصى المجمَّع تاريخياً، فنرفع lifetime ليعكس الأقل ممكن من الأقصى الفعلي
export function syncLifetimeWithStock() {
  const stock = getStock();
  const lifetime = load();
  let changed = false;
  for (const [char, count] of Object.entries(stock)) {
    if ((lifetime[char] || 0) < count) {
      lifetime[char] = count;
      changed = true;
    }
  }
  if (changed) save(lifetime);
}

// تسجيل حرف (أو أكثر) في السجل التراكمي
export function recordLetter(char, count = 1) {
  const d = load();
  d[char] = (d[char] || 0) + count;
  save(d);
}

// إجمالي الحروف المسجّلة تراكمياً
export function getLifetimeTotal() {
  return Object.values(load()).reduce((s, n) => s + n, 0);
}

// ===== نظام اللفلات (Levels) =====
// 1-100 — لا prestige.
// المعادلة: cum(N) = 5000 × (N-1)^1.5
// - cum(2)   = 5,000           (لفل 2 = 5 آلاف حرف)
// - cum(50)  ≈ 1,715,000
// - cum(100) ≈ 4,925,000        ≈ ~7 شهور بمعدل ~23-24 ألف حرف باليوم
export const MAX_LEVEL = 100;
const FIRST_LEVEL_COST = 5000;
const LEVEL_POWER = 1.5;
const TOTAL_LETTERS_AT_MAX = Math.round(FIRST_LEVEL_COST * Math.pow(MAX_LEVEL - 1, LEVEL_POWER));

function _cumLetters(level) {
  if (level <= 1) return 0;
  if (level >= MAX_LEVEL) return TOTAL_LETTERS_AT_MAX;
  return Math.round(FIRST_LEVEL_COST * Math.pow(level - 1, LEVEL_POWER));
}

// حروف مطلوبة من level → level+1
export function getRequirementForLevel(level) {
  if (level <= 1) return 0;
  return Math.max(1, _cumLetters(level) - _cumLetters(level - 1));
}

// حساب اللفل من إجمالي الحروف (1..100)
export function getLevel(totalLetters) {
  if (totalLetters <= 0) return 1;
  if (totalLetters >= TOTAL_LETTERS_AT_MAX) return MAX_LEVEL;
  // بحث ثنائي
  let lo = 1, hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (_cumLetters(mid) <= totalLetters) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// معلومات العرض (للحفاظ على API القديم)
export function getDisplayLevelInfo(rawLevel) {
  return { rawLevel, displayLevel: rawLevel, isPrestige: false };
}

// تقدم اللاعب في اللفل الحالي
export function getLevelProgress(totalLetters) {
  const level = getLevel(totalLetters);
  if (level >= MAX_LEVEL) {
    return { currentLevel: MAX_LEVEL, progress: 0, required: 0, percent: 100 };
  }
  const cumNow = _cumLetters(level);
  const cumNext = _cumLetters(level + 1);
  const required = Math.max(1, cumNext - cumNow);
  const progress = Math.max(0, totalLetters - cumNow);
  return {
    currentLevel: level,
    progress,
    required,
    percent: Math.min(100, Math.floor((progress / required) * 100)),
  };
}

// ===== الألقاب — 10 ألقاب، كل 10 لفلات =====
const RANK_TIERS = [
  { from:  1, to:  10, title: 'بذرة',     emoji: '🌱', color: '#5DD3D3' },
  { from: 11, to:  20, title: 'فسيلة',    emoji: '🌿', color: '#2ECC71' },
  { from: 21, to:  30, title: 'مغامر',    emoji: '⚡', color: '#F1C40F' },
  { from: 31, to:  40, title: 'محارب',    emoji: '🔥', color: '#E67E22' },
  { from: 41, to:  50, title: 'فارس',     emoji: '⭐', color: '#E74C3C' },
  { from: 51, to:  60, title: 'بطل',      emoji: '💎', color: '#9B59B6' },
  { from: 61, to:  70, title: 'نبيل',     emoji: '🏆', color: '#3498DB' },
  { from: 71, to:  80, title: 'أمير',     emoji: '👑', color: '#F39C12' },
  { from: 81, to:  90, title: 'ملك',      emoji: '🚀', color: '#FFD700' },
  { from: 91, to: 100, title: 'أسطورة',   emoji: '🌌', color: '#FF00FF' },
];

function _findTier(rawLevel) {
  for (const t of RANK_TIERS) {
    if (rawLevel >= t.from && rawLevel <= t.to) return t;
  }
  return RANK_TIERS[0];
}

export function getLevelTitle(rawLevel) {
  return _findTier(rawLevel).title;
}

export function getLevelColor(rawLevel) {
  return _findTier(rawLevel).color;
}

export function getLevelEmoji(rawLevel) {
  return _findTier(rawLevel).emoji;
}

export function isPrestigeLevel(rawLevel) {
  return rawLevel >= PRESTIGE_START;
}

// ===== توافق مع النظام القديم =====
export function calculateScore() {
  return getLevel(getLifetimeTotal());
}

// "الرتبة" — تنسيق نصي
export function getRank(rawLevel) {
  const title = getLevelTitle(rawLevel);
  const emoji = getLevelEmoji(rawLevel);
  return {
    label: `لفل ${rawLevel}`,
    emoji, title,
    color: getLevelColor(rawLevel),
    isPrestige: false,
  };
}

// مضاعف الحروف حسب لفل الحساب — 1.0 → 2.5 خطياً
export function getAccountLetterMultiplier() {
  const level = getLevel(getLifetimeTotal());
  return 1 + (level - 1) / 66; // L1=1.0, L50=1.74, L100=2.5
}
