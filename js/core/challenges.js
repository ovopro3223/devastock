// ===== نظام التحديات اليومية والأسبوعية =====
import { getState, setState } from './app-state.js';
import { getCounter } from './achievements.js';
import { saveLetterToStock } from './storage.js';
import { recordLetter } from './lifetime-storage.js';

const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';

// ===== قوالب التحديات =====
// كل قالب: id, title, desc, icon, counter, target, reward
const DAILY_TEMPLATES = [
  { id: 'd_letters_50',  title: 'جامع نشيط',     desc: 'التقط 50 حرفاً اليوم',          icon: '📜', counter: 'letters_caught', target: 50,  reward: 30 },
  { id: 'd_letters_100', title: 'جامع متمرس',    desc: 'التقط 100 حرف اليوم',           icon: '📚', counter: 'letters_caught', target: 100, reward: 60 },
  { id: 'd_play_rain',   title: 'تذوق المطر',    desc: 'العب مطر الأحرف 3 مرات',        icon: '🌧️', counter: 'plays_letter-rain', target: 3, reward: 25 },
  { id: 'd_play_blaze',  title: 'إخماد الحرائق',  desc: 'العب حريق الحروف 3 مرات',       icon: '🔥', counter: 'plays_letter-blaze', target: 3, reward: 25 },
  { id: 'd_play_taxi',   title: 'سائق ماهر',      desc: 'العب التاكسي 3 مرات',           icon: '🚕', counter: 'plays_taxi', target: 3, reward: 25 },
  { id: 'd_play_fishing',title: 'صياد اليوم',     desc: 'العب الصيد 3 مرات',             icon: '🎣', counter: 'plays_fishing', target: 3, reward: 25 },
  { id: 'd_play_sniper', title: 'قنّاص اليوم',    desc: 'العب القنص 3 مرات',             icon: '🎯', counter: 'plays_sniper', target: 3, reward: 25 },
  { id: 'd_play_casino', title: 'دوّار',          desc: 'دوّر بالكازينو 5 مرات',         icon: '🎰', counter: 'plays_casino', target: 5, reward: 20 },
  { id: 'd_museum',      title: 'هاوي ثقافي',     desc: 'اقتنِ كلمة من المتحف',          icon: '🏛️', counter: 'museum_words', target: 1, reward: 40 },
  { id: 'd_score_rain',  title: 'إعصار',          desc: '100 نقطة بمطر الأحرف',          icon: '☔', counter: 'high_score_letter-rain', target: 100, reward: 50 },
];

const WEEKLY_TEMPLATES = [
  { id: 'w_letters_500',   title: 'أسبوع نشيط',       desc: 'التقط 500 حرف هذا الأسبوع',  icon: '🏛️', counter: 'letters_caught', target: 500,  reward: 200 },
  { id: 'w_letters_1500',  title: 'أسبوع أسطوري',      desc: 'التقط 1500 حرف هذا الأسبوع', icon: '🌌', counter: 'letters_caught', target: 1500, reward: 500 },
  { id: 'w_play_all',      title: 'تجربة الأنماط',     desc: 'العب كل نمط مرة على الأقل',  icon: '🎮', counter: '__play_all_modes__', target: 6, reward: 300 },
  { id: 'w_museum_5',      title: 'صياد المعرفة',      desc: 'اقتنِ 5 كلمات من المتحف',    icon: '📖', counter: 'museum_words', target: 5, reward: 250 },
  { id: 'w_forum_post',    title: 'ناشط مجتمعي',       desc: 'انشر 3 مواضيع بالمنتدى',     icon: '✍️', counter: 'forum_posts_created', target: 3, reward: 150 },
  { id: 'w_chat_messages', title: 'ثرثار الأسبوع',     desc: 'ابعث 30 رسالة شات',          icon: '💬', counter: 'chat_messages_sent', target: 30, reward: 200 },
  { id: 'w_sniper_words',  title: 'صائد الكلمات',      desc: 'اقنص 10 كلمات بالقناص',      icon: '🏹', counter: 'sniper_words_completed', target: 10, reward: 250 },
];

// ===== الوقت =====
function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function weekKey(date = new Date()) {
  // ISO week — يبدأ الأسبوع يوم الإثنين
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function msUntilNextDay() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return tomorrow - now;
}

function msUntilNextWeek() {
  const now = new Date();
  const nextMon = new Date(now);
  const day = nextMon.getDay() || 7;
  nextMon.setDate(nextMon.getDate() + (8 - day));
  nextMon.setHours(0, 0, 0, 0);
  return nextMon - now;
}

// ===== التخزين =====
function load() {
  return getState('challenges_v1', {
    dayKey: '',
    weekKey: '',
    daily: [],     // [{ tplId, baseline, claimed }]
    weekly: [],    // [{ tplId, baseline, claimed }]
  });
}
function save(d) { setState('challenges_v1', d); }

// ===== توليد التحديات =====
function pickRandom(arr, count) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < count && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function _readCounterValue(counter) {
  if (counter === '__play_all_modes__') {
    return ['letter-rain','letter-blaze','taxi','fishing','sniper','casino']
      .filter(id => getCounter(`plays_${id}`) > 0).length;
  }
  return getCounter(counter);
}

function _generateDaily() {
  const picks = pickRandom(DAILY_TEMPLATES, 3);
  return picks.map(tpl => ({
    tplId: tpl.id,
    baseline: _readCounterValue(tpl.counter),
    claimed: false,
  }));
}

function _generateWeekly() {
  const picks = pickRandom(WEEKLY_TEMPLATES, 2);
  return picks.map(tpl => ({
    tplId: tpl.id,
    baseline: _readCounterValue(tpl.counter),
    claimed: false,
  }));
}

// ===== التحديث (يُستدعى عند فتح الصفحة) =====
export function refreshChallenges() {
  const d = load();
  const today = dayKey();
  const week = weekKey();
  let changed = false;

  if (d.dayKey !== today || d.daily.length === 0) {
    d.dayKey = today;
    d.daily = _generateDaily();
    changed = true;
  }

  if (d.weekKey !== week || d.weekly.length === 0) {
    d.weekKey = week;
    d.weekly = _generateWeekly();
    changed = true;
  }

  if (changed) save(d);
  return d;
}

// ===== استعلام =====
function _findTemplate(tplId) {
  return DAILY_TEMPLATES.find(t => t.id === tplId)
    || WEEKLY_TEMPLATES.find(t => t.id === tplId);
}

function _buildState(entry) {
  const tpl = _findTemplate(entry.tplId);
  if (!tpl) return null;
  const current = _readCounterValue(tpl.counter);
  const progress = Math.max(0, current - entry.baseline);
  const completed = progress >= tpl.target;
  return {
    ...tpl,
    progress: Math.min(progress, tpl.target),
    completed,
    claimed: !!entry.claimed,
    canClaim: completed && !entry.claimed,
  };
}

export function getChallengesState() {
  const d = refreshChallenges();
  return {
    daily: d.daily.map(_buildState).filter(Boolean),
    weekly: d.weekly.map(_buildState).filter(Boolean),
    msUntilDailyReset: msUntilNextDay(),
    msUntilWeeklyReset: msUntilNextWeek(),
  };
}

// ===== المطالبة بالمكافأة =====
export function claimChallenge(tplId) {
  const d = load();
  const entry = d.daily.find(e => e.tplId === tplId)
    || d.weekly.find(e => e.tplId === tplId);
  if (!entry) return { ok: false, reason: 'not_found' };
  if (entry.claimed) return { ok: false, reason: 'already_claimed' };

  const tpl = _findTemplate(tplId);
  if (!tpl) return { ok: false, reason: 'invalid' };

  const current = _readCounterValue(tpl.counter);
  const progress = current - entry.baseline;
  if (progress < tpl.target) return { ok: false, reason: 'not_complete' };

  // أضف مكافأة الأحرف العشوائية
  const reward = tpl.reward;
  const granted = {};
  for (let i = 0; i < reward; i++) {
    const ch = ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
    saveLetterToStock(ch);
    recordLetter(ch, 1);
    granted[ch] = (granted[ch] || 0) + 1;
  }

  entry.claimed = true;
  save(d);

  return { ok: true, reward, granted };
}

// ===== شارة "تحديات جاهزة" =====
export function getReadyChallengeCount() {
  const state = getChallengesState();
  return state.daily.filter(c => c.canClaim).length
    + state.weekly.filter(c => c.canClaim).length;
}

// ===== صياغة الوقت المتبقي =====
export function formatTimeLeft(ms) {
  if (ms <= 0) return '0';
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}ي ${hours}س`;
  if (hours > 0) return `${hours}س ${mins}د`;
  return `${mins}د`;
}
