// ===== إحصائيات الألعاب لكل نمط =====
import { getState, setState } from './app-state.js';
import { incrementCounter, setCounterMax } from './achievements.js';
import { addSeasonPoints } from './seasons.js';

const VALID_GAMES = ['letter-rain', 'letter-blaze', 'taxi', 'fishing', 'sniper', 'casino'];

function load() {
  return getState('game_stats', {});
}
function save(d) { setState('game_stats', d); }

function _ensure(gameId) {
  const all = load();
  if (!all[gameId]) {
    all[gameId] = {
      plays: 0,
      wins: 0,
      lettersCollected: 0,
      highScore: 0,
      totalScore: 0,
      lastPlayed: 0,
    };
  }
  return all;
}

// ===== تسجيل بداية جلسة لعب =====
export function recordPlayStart(gameId) {
  if (!VALID_GAMES.includes(gameId)) return;
  const all = _ensure(gameId);
  all[gameId].plays += 1;
  all[gameId].lastPlayed = Date.now();
  save(all);
  // ربط مع الإنجازات
  incrementCounter(`plays_${gameId}`);
}

// ===== تسجيل نهاية الجلسة =====
// info: { score, lettersCollected, won }
export function recordPlayEnd(gameId, info = {}) {
  if (!VALID_GAMES.includes(gameId)) return;
  const all = _ensure(gameId);
  const stats = all[gameId];

  const score = info.score || 0;
  const lettersCollected = info.lettersCollected || 0;

  stats.totalScore += score;
  stats.lettersCollected += lettersCollected;
  if (score > stats.highScore) stats.highScore = score;
  if (info.won) stats.wins += 1;
  save(all);

  // ربط الإنجازات
  setCounterMax(`high_score_${gameId}`, stats.highScore);
  if (info.won) incrementCounter(`wins_${gameId}`);
  if (lettersCollected > 0) incrementCounter('letters_caught', lettersCollected);

  // نقاط الموسم: 1 نقطة/حرف، +20 على الفوز، +ثلث السكور
  const seasonPts = lettersCollected + (info.won ? 20 : 0) + Math.floor(score / 3);
  if (seasonPts > 0) addSeasonPoints(seasonPts);
}

// ===== استعلام =====
export function getGameStats(gameId) {
  return load()[gameId] || {
    plays: 0, wins: 0, lettersCollected: 0, highScore: 0, totalScore: 0, lastPlayed: 0,
  };
}

export function getAllGameStats() {
  const all = load();
  return VALID_GAMES.reduce((acc, id) => {
    acc[id] = all[id] || { plays: 0, wins: 0, lettersCollected: 0, highScore: 0, totalScore: 0, lastPlayed: 0 };
    return acc;
  }, {});
}

export function getGameLabel(gameId) {
  return {
    'letter-rain':  '🌧️ مطر الأحرف',
    'letter-blaze': '🔥 حريق الحروف',
    'taxi':          '🚕 التاكسي',
    'fishing':       '🎣 الصيد',
    'sniper':        '🎯 القنص',
    'casino':        '🎰 الكازينو',
  }[gameId] || gameId;
}
