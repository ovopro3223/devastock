// ===== تطور كل لعبة (Per-game Progression) =====
import { getAllGameStats } from './game-stats.js';

const GAME_LABELS = {
  'letter-rain':  '🌧️ مطر الأحرف',
  'letter-blaze': '🔥 حريق الحروف',
  'taxi':         '🚕 التاكسي',
  'fishing':      '🎣 الصيد',
  'sniper':       '🎯 القنص',
  'casino':       '🎰 الكازينو',
};

// كل لعبة تستحق "Mastery Level" يبدأ من 1 وينمو حسب XP
// XP = plays + lettersCollected*0.5 + wins*5 + highScore*0.2
function _calcXP(stats) {
  return Math.floor(
    (stats.plays || 0) +
    (stats.lettersCollected || 0) * 0.5 +
    (stats.wins || 0) * 5 +
    (stats.highScore || 0) * 0.2
  );
}

// تكلفة اللفل التالي (نمو خطّي معتدل)
function _xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.round(50 * Math.pow(level - 1, 1.4));
}

function _levelFromXP(xp) {
  let lvl = 1;
  let cum = 0;
  while (lvl < 30) {
    const need = _xpForLevel(lvl + 1);
    if (cum + need > xp) break;
    cum += need;
    lvl++;
  }
  return { level: lvl, cumulativeXP: cum };
}

// مكافآت يفتحها كل لفل (مضاعف، علاوات، فتوحات) — معتدلة
const LEVEL_PERKS = {
  3:  { multiplier: 1.05, description: '+5% أحرف' },
  6:  { multiplier: 1.10, description: '+10% أحرف' },
  10: { multiplier: 1.15, description: '+15% أحرف' },
  15: { multiplier: 1.20, description: '+20% أحرف' },
  20: { multiplier: 1.25, description: '+25% أحرف' },
  25: { multiplier: 1.30, description: '+30% أحرف' },
  30: { multiplier: 1.40, description: '🌟 ملك اللعبة +40%' },
};

function _multiplierFor(level) {
  let mult = 1;
  for (const lv of Object.keys(LEVEL_PERKS).map(Number).sort((a,b) => a-b)) {
    if (level >= lv) mult = LEVEL_PERKS[lv].multiplier;
  }
  return mult;
}

function _nextPerk(level) {
  for (const lv of Object.keys(LEVEL_PERKS).map(Number).sort((a,b) => a-b)) {
    if (lv > level) return { level: lv, ...LEVEL_PERKS[lv] };
  }
  return null;
}

// ===== استعلام لكل لعبة =====
export function getGameProgression(gameId) {
  const stats = (getAllGameStats())[gameId] || { plays: 0, wins: 0, lettersCollected: 0, highScore: 0, totalScore: 0 };
  const xp = _calcXP(stats);
  const { level, cumulativeXP } = _levelFromXP(xp);
  const need = _xpForLevel(level + 1);
  const inLevel = xp - cumulativeXP;
  const percent = need > 0 ? Math.min(100, Math.floor((inLevel / need) * 100)) : 100;

  return {
    gameId,
    label: GAME_LABELS[gameId] || gameId,
    xp,
    level,
    inLevel,
    needForNext: need,
    percent,
    multiplier: _multiplierFor(level),
    nextPerk: _nextPerk(level),
    stats,
  };
}

// ===== مضاعف الحروف للعبة (يستخدمه كل game.js) =====
export function getLetterMultiplier(gameId) {
  return _multiplierFor(getGameProgression(gameId).level);
}

// ===== كل الألعاب — للعرض =====
export function getAllGameProgression() {
  return Object.keys(GAME_LABELS).map(getGameProgression);
}
