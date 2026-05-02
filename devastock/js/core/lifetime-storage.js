import { getState, setState } from './app-state.js';

function load() {
  return getState('lifetime', {});
}
function save(d) { setState('lifetime', d); }

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
// المستوى 1 إلى 120، الحرف الكلي يحدد اللفل

// حساب الحروف المطلوبة من level → level+1
export function getRequirementForLevel(level) {
  if (level <= 1) return 0;
  if (level <= 3) return 1000;
  if (level === 4) return 1500;
  if (level === 5) return 2000;
  // من lvl 6 إلى 120، نمو exponential من 2500 إلى 5,000,000
  return Math.round(2500 * Math.pow(2000, (level - 6) / 114));
}

// حساب اللفل من إجمالي الحروف
export function getLevel(totalLetters) {
  let level = 1;
  let cumulative = 0;
  while (level < 120) {
    const required = getRequirementForLevel(level + 1);
    if (cumulative + required > totalLetters) break;
    cumulative += required;
    level++;
  }
  return level;
}

// تقدم اللاعب في اللفل الحالي (للـ progress bar)
export function getLevelProgress(totalLetters) {
  let level = 1;
  let cumulative = 0;
  while (level < 120) {
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
  return { currentLevel: 120, progress: 0, required: 0, percent: 100 };
}

// ===== توافق مع النظام القديم =====
// يحسب "السكور" القديم = اللفل الحالي
export function calculateScore() {
  return getLevel(getLifetimeTotal());
}

// "الرتبة" القديمة الآن = "اللفل" الجديد
export function getRank(level) {
  return {
    label: `لفل ${level}`,
    emoji: getLevelEmoji(level),
  };
}

// إيموجي حسب اللفل
export function getLevelEmoji(level) {
  if (level >=  1 && level <=  10) return '🌱';
  if (level <=  20) return '🌿';
  if (level <=  30) return '⚡';
  if (level <=  40) return '🔥';
  if (level <=  50) return '⭐';
  if (level <=  60) return '💎';
  if (level <=  70) return '🏆';
  if (level <=  80) return '👑';
  if (level <=  90) return '🚀';
  if (level <= 100) return '💫';
  if (level <= 110) return '🌟';
  return '🌌';
}
