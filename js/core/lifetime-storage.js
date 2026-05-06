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
// 1-120: اللفلات العادية. 121-150: لفلات prestige (تظهر كـ "P-1" إلى "P-30")
// كل مدى من 10 لفلات له لقب خاص ولون
const LEVEL_SCALE = 0.30;
export const MAX_LEVEL = 150;          // 120 + 30 prestige
export const PRESTIGE_START = 121;     // أول لفل بريستيج

// حساب الحروف المطلوبة من level → level+1
export function getRequirementForLevel(level) {
  if (level <= 1) return 0;
  if (level <= 3) return Math.round(1000 * LEVEL_SCALE);
  if (level === 4) return Math.round(1500 * LEVEL_SCALE);
  if (level === 5) return Math.round(2000 * LEVEL_SCALE);
  // 6-120: نمو exponential عادي
  if (level <= 120) {
    return Math.round(2500 * Math.pow(2000, (level - 6) / 114) * LEVEL_SCALE);
  }
  // 121-150 (prestige): تكلفة عالية ثابتة الأساس + نمو خفيف
  // أساسها = تكلفة لفل 120 × 2، ثم تتضاعف كل 5 لفلات
  const base = Math.round(2500 * Math.pow(2000, (120 - 6) / 114) * LEVEL_SCALE);
  const prestigeIdx = level - 120; // 1..30
  return Math.round(base * 2 * Math.pow(1.15, prestigeIdx - 1));
}

// حساب اللفل الخام (1..150) من إجمالي الحروف
export function getLevel(totalLetters) {
  let level = 1;
  let cumulative = 0;
  while (level < MAX_LEVEL) {
    const required = getRequirementForLevel(level + 1);
    if (cumulative + required > totalLetters) break;
    cumulative += required;
    level++;
  }
  return level;
}

// تحويل اللفل الخام (1..150) لمعلومات العرض
// { displayLevel, isPrestige, prestigeLevel?, rawLevel }
export function getDisplayLevelInfo(rawLevel) {
  if (rawLevel <= 120) {
    return { rawLevel, displayLevel: rawLevel, isPrestige: false };
  }
  const prestigeLevel = rawLevel - 120; // 1..30
  return {
    rawLevel,
    displayLevel: prestigeLevel,
    prestigeLevel,
    isPrestige: true,
  };
}

// تقدم اللاعب في اللفل الحالي (للـ progress bar)
export function getLevelProgress(totalLetters) {
  let level = 1;
  let cumulative = 0;
  while (level < MAX_LEVEL) {
    const required = getRequirementForLevel(level + 1);
    if (cumulative + required > totalLetters) {
      return {
        currentLevel: level,
        progress: totalLetters - cumulative,
        required: required,
        percent: Math.floor(((totalLetters - cumulative) / required) * 100),
      };
    }
    cumulative += required;
    level++;
  }
  return { currentLevel: MAX_LEVEL, progress: 0, required: 0, percent: 100 };
}

// ===== الألقاب — كل 10 لفلات لها لقب ولون =====
// 12 لقب أساسي (1-120) + 3 ألقاب prestige (P1-P30)
const RANK_TIERS = [
  // 1-120 base
  { from:   1, to:  10, title: 'بذرة',         emoji: '🌱', color: '#5DD3D3' },
  { from:  11, to:  20, title: 'فسيلة',        emoji: '🌿', color: '#2ECC71' },
  { from:  21, to:  30, title: 'مغامر',        emoji: '⚡', color: '#F1C40F' },
  { from:  31, to:  40, title: 'محارب',        emoji: '🔥', color: '#E67E22' },
  { from:  41, to:  50, title: 'فارس',         emoji: '⭐', color: '#E74C3C' },
  { from:  51, to:  60, title: 'بطل',          emoji: '💎', color: '#9B59B6' },
  { from:  61, to:  70, title: 'نبيل',         emoji: '🏆', color: '#3498DB' },
  { from:  71, to:  80, title: 'أمير',         emoji: '👑', color: '#F39C12' },
  { from:  81, to:  90, title: 'ملك',          emoji: '🚀', color: '#FFD700' },
  { from:  91, to: 100, title: 'إمبراطور',     emoji: '💫', color: '#FF1493' },
  { from: 101, to: 110, title: 'أسطورة',       emoji: '🌟', color: '#00FFFF' },
  { from: 111, to: 120, title: 'خرافي',        emoji: '🌌', color: '#8A2BE2' },
  // 121-150 prestige
  { from: 121, to: 130, title: 'منتخب',         emoji: '🔱', color: '#FF4500', prestige: true },
  { from: 131, to: 140, title: 'عرّاف',         emoji: '🦅', color: '#00CED1', prestige: true },
  { from: 141, to: 150, title: 'سيد العرش',     emoji: '👁️', color: '#FF00FF', prestige: true },
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
  const info = getDisplayLevelInfo(rawLevel);
  const title = getLevelTitle(rawLevel);
  const emoji = getLevelEmoji(rawLevel);
  const label = info.isPrestige
    ? `بريستيج ${info.prestigeLevel}`
    : `لفل ${info.displayLevel}`;
  return { label, emoji, title, color: getLevelColor(rawLevel), isPrestige: info.isPrestige };
}

// مضاعف الحروف حسب لفل الحساب — يكافئ المستويات العالية
export function getAccountLetterMultiplier() {
  const level = getLevel(getLifetimeTotal());
  // 1: ×1.0، 50: ×1.6، 100: ×2.2، 120: ×2.5، prestige: 2.5..3.5
  if (level <= 120) return 1 + (level - 1) / 80;
  return 2.5 + (level - 120) / 30; // P1: 2.53, P30: 3.5
}
