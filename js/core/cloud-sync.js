// ===== مزامنة البيانات مع Firestore =====
// يعترض localStorage.setItem بشكل شفاف — لا يحتاج أي تعديل في بقية الملفات

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getState, setState, removeState } from './app-state.js';

const KEYS = [
  'devastock_stock',
  'devastock_museum',
  'devastock_lifetime',
  'devastock_profile',
  'devastock_profile_unlocked',
  'devastock_settings',
  'devastock_season_v1',
  'devastock_game_stats',
  'devastock_school_v1',
];

let _db         = null;
let _uid        = null;
let _timer      = null;
let _hooked     = false;
let _restoring  = false;

// ===== تفعيل/إيقاف المزامنة =====
export function setupSync(db, uid) {
  _db  = db;
  _uid = uid;
  if (!_hooked) _hookLocalStorage();
  // عند الدخول، حدّث lb فوراً عشان يتم تطبيق LEVEL_SCALE الجديد
  if (db && uid) {
    setTimeout(() => _updateLeaderboard(), 1500);
  }
}

// ===== اعتراض localStorage بشكل شفاف =====
function _hookLocalStorage() {
  _hooked = true;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  Storage.prototype.setItem = function(key, value) {
    originalSetItem.call(this, key, value);
    if (_db && _uid && KEYS.includes(key) && !_restoring) {
      _scheduleSync();
    }
  };

  Storage.prototype.removeItem = function(key) {
    originalRemoveItem.call(this, key);
    if (_db && _uid && KEYS.includes(key) && !_restoring) {
      _scheduleSync();
    }
  };
}

// ===== مزامنة مؤجلة (debounce) =====
function _scheduleSync() {
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(_pushToCloud, 900);
}

async function _pushToCloud() {
  if (!_db || !_uid) return;
  try {
    const data = _gatherLocalData();
    await setDoc(doc(_db, 'users', _uid), {
      ...data,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    // تحديث لوحة المتصدرين
    await _updateLeaderboard();
  } catch (e) {
    // الفشل صامت — البيانات محفوظة في localStorage
  }
}

// ===== جمع كل بيانات المستخدم =====
function _gatherLocalData() {
  return {
    stock:           _parseLS('devastock_stock',    {}),
    museum:          _parseLS('devastock_museum',   {}),
    lifetime:        _parseLS('devastock_lifetime', {}),
    profile:         _parseLS('devastock_profile',  {}),
    settings:        _parseLS('devastock_settings', { muted: false, musicEnabled: true, volume: 0.8 }),
    profileUnlocked: getState('profile_unlocked', false) === true,
    season:          _parseLS('devastock_season_v1', { seasonId: '', score: 0 }),
    gameStats:       _parseLS('devastock_game_stats', {}),
    school:          _parseLS('devastock_school_v1', { unlockedGrades: [0], students: {}, lastTickAt: Date.now() }),
  };
}

function _parseLS(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

// ===== تحديث لوحة المتصدرين =====
async function _updateLeaderboard() {
  if (!_db || !_uid) return;
  try {
    const lifetime = _parseLS('devastock_lifetime', {});
    const total    = Object.values(lifetime).reduce((s, n) => s + n, 0);

    // حساب اللفل من إجمالي الحروف
    const level = _calculateLevel(total);
    const emoji = _levelEmoji(level);

    const profile = _parseLS('devastock_profile', {});
    const season  = _parseLS('devastock_season_v1', { seasonId: '', score: 0 });
    const tier    = _tierFor(season.score || 0);

    // ===== استخراج highScore لكل لعبة =====
    const fullStats = _parseLS('devastock_game_stats', {});
    const gameHighScores = {};
    for (const [gameId, stats] of Object.entries(fullStats)) {
      gameHighScores[gameId] = {
        highScore: stats.highScore || 0,
        plays: stats.plays || 0,
        wins: stats.wins || 0,
      };
    }

    await setDoc(doc(_db, 'leaderboard', _uid), {
      displayName:  profile.name || 'لاعب مجهول',
      avatar:       profile.avatar || '👤',
      avatarImage:  profile.avatarImage || '',
      score:        level,
      totalLetters: total,
      rankLabel:    `لفل ${level}`,
      rankEmoji:    emoji,
      seasonId:     season.seasonId || '',
      seasonScore:  season.score || 0,
      tierId:       tier.id,
      tierLabel:    tier.label,
      tierEmoji:    tier.emoji,
      gameStats:    gameHighScores,
      updatedAt:    serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    // صامت
  }
}

// تكرار محلي للمستويات (تجنباً لـ circular import مع seasons.js)
function _tierFor(score) {
  if (score >= 20000) return { id: 'master',   label: 'أسطوري',  emoji: '👑' };
  if (score >= 10000) return { id: 'diamond',  label: 'ماسي',    emoji: '💎' };
  if (score >= 5000)  return { id: 'platinum', label: 'بلاتيني', emoji: '💠' };
  if (score >= 2000)  return { id: 'gold',     label: 'ذهبي',    emoji: '🥇' };
  if (score >= 500)   return { id: 'silver',   label: 'فضي',     emoji: '🥈' };
  return { id: 'bronze', label: 'برونزي', emoji: '🥉' };
}

// ===== حساب اللفل (مكرر هنا تجنباً لـ circular import) =====
function _calculateLevel(totalLetters) {
  let level = 1;
  let cumulative = 0;
  while (level < 120) {
    const required = _requirementForLevel(level + 1);
    if (cumulative + required > totalLetters) break;
    cumulative += required;
    level++;
  }
  return level;
}

// لازم يطابق lifetime-storage.js LEVEL_SCALE
const _LEVEL_SCALE = 0.30;
function _requirementForLevel(level) {
  if (level <= 1) return 0;
  if (level <= 3) return Math.round(1000 * _LEVEL_SCALE);
  if (level === 4) return Math.round(1500 * _LEVEL_SCALE);
  if (level === 5) return Math.round(2000 * _LEVEL_SCALE);
  return Math.round(2500 * Math.pow(2000, (level - 6) / 114) * _LEVEL_SCALE);
}

function _levelEmoji(level) {
  if (level <=  10) return '🌱';
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

// ===== سحب البيانات من السحابة عند تسجيل الدخول =====
export async function pullFromCloud(db, uid) {
  if (!db || !uid) return;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return; // مستخدم جديد — ابدأ بيانات نظيفة

    const data = snap.data();
    _restoring = true;
    try {
      if (data.stock)     setState('stock', data.stock);
      if (data.museum)    setState('museum', data.museum);
      if (data.lifetime)  setState('lifetime', data.lifetime);
      if (data.profile)   setState('profile', data.profile);
      if (data.settings)  setState('settings', data.settings);
      if (data.season)    setState('season_v1', data.season);
      if (data.gameStats) setState('game_stats', data.gameStats);
      if (data.school)    setState('school_v1', data.school);

      if (data.profileUnlocked === true) {
        setState('profile_unlocked', true);
      } else if (data.profileUnlocked === false) {
        removeState('profile_unlocked');
      }
    } finally {
      _restoring = false;
    }
  } catch (e) {
    // إذا فشل السحب، يعمل الكود من localStorage الموجود
  }
}
