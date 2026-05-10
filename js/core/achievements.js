// ===== نظام الإنجازات =====
import { getState, setState } from './app-state.js';
import { getLifetimeTotal, getLevel } from './lifetime-storage.js';
import { getStock } from './storage.js';
import { playAchievementSound } from './audio.js';

// ===== تعريفات الإنجازات =====
// كل إنجاز: id, title, desc, icon, category, target, getProgress(state)
export const ACHIEVEMENTS = [
  // ===== تجميع الحروف =====
  { id: 'first-letter',     title: 'الخطوة الأولى',     desc: 'التقط أول حرف',                icon: '🌱', category: 'letters', target: 1,
    getProgress: () => getCounter('letters_caught') },
  { id: 'letters-100',      title: 'هاوي الحروف',       desc: 'التقط 100 حرف',               icon: '📜', category: 'letters', target: 100,
    getProgress: () => getCounter('letters_caught') },
  { id: 'letters-1000',     title: 'جامع محترف',         desc: 'التقط 1,000 حرف',             icon: '📚', category: 'letters', target: 1000,
    getProgress: () => getCounter('letters_caught') },
  { id: 'letters-10000',    title: 'سيد الحروف',          desc: 'التقط 10,000 حرف',           icon: '🏛️', category: 'letters', target: 10000,
    getProgress: () => getCounter('letters_caught') },
  { id: 'all-28-letters',   title: 'الأبجدية كاملة',     desc: 'اجمع كل الـ28 حرف عربي مرة على الأقل', icon: '🔤', category: 'letters', target: 28,
    getProgress: () => Object.keys(getStock()).filter(c => 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.includes(c)).length },

  // ===== اللفلات =====
  { id: 'level-5',          title: 'لاعب جاد',           desc: 'وصل لفل 5',                    icon: '⚡', category: 'level', target: 5,
    getProgress: () => getLevel(getLifetimeTotal()) },
  { id: 'level-10',         title: 'محارب الحروف',       desc: 'وصل لفل 10',                  icon: '🔥', category: 'level', target: 10,
    getProgress: () => getLevel(getLifetimeTotal()) },
  { id: 'level-25',         title: 'خبير',                 desc: 'وصل لفل 25',                  icon: '⭐', category: 'level', target: 25,
    getProgress: () => getLevel(getLifetimeTotal()) },
  { id: 'level-50',         title: 'أسطورة',                 desc: 'وصل لفل 50',                  icon: '💎', category: 'level', target: 50,
    getProgress: () => getLevel(getLifetimeTotal()) },
  { id: 'level-100',        title: 'إله الحروف',          desc: 'وصل لفل 100',                 icon: '🌟', category: 'level', target: 100,
    getProgress: () => getLevel(getLifetimeTotal()) },

  // ===== الألعاب =====
  { id: 'play-rain',        title: 'تذوق المطر',          desc: 'العب مطر الأحرف مرة',          icon: '🌧️', category: 'games', target: 1,
    getProgress: () => getCounter('plays_letter-rain') },
  { id: 'play-blaze',       title: 'تذوق النار',           desc: 'العب حريق الحروف مرة',         icon: '🔥', category: 'games', target: 1,
    getProgress: () => getCounter('plays_letter-blaze') },
  { id: 'play-taxi',        title: 'انطلاقة',              desc: 'العب التاكسي مرة',              icon: '🚕', category: 'games', target: 1,
    getProgress: () => getCounter('plays_taxi') },
  { id: 'play-fishing',     title: 'صياد مبتدئ',          desc: 'العب الصيد مرة',                icon: '🎣', category: 'games', target: 1,
    getProgress: () => getCounter('plays_fishing') },
  { id: 'play-sniper',      title: 'تصويب أول',            desc: 'العب القنص مرة',                icon: '🎯', category: 'games', target: 1,
    getProgress: () => getCounter('plays_sniper') },
  { id: 'play-casino',      title: 'مقامر',                desc: 'دوّر بالكازينو مرة',            icon: '🎰', category: 'games', target: 1,
    getProgress: () => getCounter('plays_casino') },
  { id: 'play-all-modes',   title: 'موسوعي',               desc: 'جرب كل الأنماط الستة',          icon: '🎮', category: 'games', target: 6,
    getProgress: () => ['letter-rain','letter-blaze','taxi','fishing','sniper','casino'].filter(id => getCounter(`plays_${id}`) > 0).length },

  // ===== الإنجازات داخل الألعاب =====
  { id: 'high-score-rain-50',  title: 'ماطر',              desc: '50 نقطة بمطر الأحرف',           icon: '☔', category: 'high-score', target: 50,
    getProgress: () => getCounter('high_score_letter-rain') },
  { id: 'high-score-rain-200', title: 'إعصار',             desc: '200 نقطة بمطر الأحرف',          icon: '🌪️', category: 'high-score', target: 200,
    getProgress: () => getCounter('high_score_letter-rain') },
  { id: 'casino-triple',    title: 'الجاكبوت',              desc: 'احصل على 3 أحرف متطابقة بالكازينو', icon: '💰', category: 'high-score', target: 1,
    getProgress: () => getCounter('casino_triples') },
  { id: 'sniper-3-words',   title: 'قنّاص دقيق',          desc: 'اقنص 3 كلمات بالقناص',           icon: '🏹', category: 'high-score', target: 3,
    getProgress: () => getCounter('sniper_words_completed') },

  // ===== المتحف =====
  { id: 'museum-first',     title: 'بداية المتحف',         desc: 'اشترِ كلمتك الأولى',             icon: '🏛️', category: 'museum', target: 1,
    getProgress: () => getCounter('museum_words') },
  { id: 'museum-10',        title: 'هاوي ثقافي',           desc: 'اشترِ 10 كلمات',                 icon: '📖', category: 'museum', target: 10,
    getProgress: () => getCounter('museum_words') },
  { id: 'museum-50',        title: 'مثقف',                  desc: 'اشترِ 50 كلمة',                  icon: '🎓', category: 'museum', target: 50,
    getProgress: () => getCounter('museum_words') },

  // ===== المجتمع =====
  { id: 'first-friend',     title: 'صديق أول',              desc: 'أضف أول صديق',                    icon: '🤝', category: 'social', target: 1,
    getProgress: () => getCounter('friends_added') },
  { id: 'social-butterfly', title: 'فراشة اجتماعية',       desc: 'أضف 10 أصدقاء',                  icon: '🦋', category: 'social', target: 10,
    getProgress: () => getCounter('friends_added') },
  { id: 'first-message',    title: 'مرحباً!',                desc: 'ابعث أول رسالة شات',              icon: '💬', category: 'social', target: 1,
    getProgress: () => getCounter('chat_messages_sent') },
  { id: 'chatty',           title: 'ثرثار',                  desc: 'ابعث 50 رسالة',                  icon: '🗨️', category: 'social', target: 50,
    getProgress: () => getCounter('chat_messages_sent') },
  { id: 'first-post',       title: 'كاتب',                    desc: 'انشر موضوع أول بالمنتدى',         icon: '✍️', category: 'social', target: 1,
    getProgress: () => getCounter('forum_posts_created') },
  { id: 'first-comment',    title: 'مشارك',                   desc: 'علّق على موضوع',                   icon: '💭', category: 'social', target: 1,
    getProgress: () => getCounter('forum_comments_created') },
];

// ===== التخزين =====
function load() {
  return getState('achievements_v2', { counters: {}, unlocked: {} });
}
function save(d) { setState('achievements_v2', d); }

// ===== العدّادات =====
export function incrementCounter(name, by = 1) {
  const d = load();
  d.counters[name] = (d.counters[name] || 0) + by;
  save(d);
  checkAchievements();
}

export function setCounter(name, value) {
  const d = load();
  d.counters[name] = value;
  save(d);
  checkAchievements();
}

export function setCounterMax(name, value) {
  const d = load();
  if ((d.counters[name] || 0) < value) {
    d.counters[name] = value;
    save(d);
    checkAchievements();
  }
}

export function getCounter(name) {
  return load().counters[name] || 0;
}

// ===== فحص الإنجازات =====
let _toastQueue = [];
let _toastShowing = false;

export function checkAchievements() {
  const d = load();
  const newlyUnlocked = [];
  for (const ach of ACHIEVEMENTS) {
    if (d.unlocked[ach.id]) continue;
    let progress = 0;
    try { progress = ach.getProgress(); } catch (e) { progress = 0; }
    if (progress >= ach.target) {
      d.unlocked[ach.id] = { unlockedAt: Date.now() };
      newlyUnlocked.push(ach);
    }
  }
  if (newlyUnlocked.length > 0) {
    save(d);
    newlyUnlocked.forEach(a => _queueToast(a));
  }
  return newlyUnlocked;
}

// ===== Toast إنجاز =====
function _queueToast(ach) {
  _toastQueue.push(ach);
  if (!_toastShowing) _showNextToast();
}

function _showNextToast() {
  if (_toastQueue.length === 0) {
    _toastShowing = false;
    return;
  }
  _toastShowing = true;
  const ach = _toastQueue.shift();
  playAchievementSound();
  const toast = document.getElementById('achievement-toast');
  const icon  = document.getElementById('achievement-toast-icon');
  const title = document.getElementById('achievement-toast-title');
  if (!toast || !icon || !title) {
    _toastShowing = false;
    return;
  }
  icon.textContent  = ach.icon;
  title.textContent = ach.title;
  toast.hidden = false;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.hidden = true;
      _showNextToast();
    }, 400);
  }, 3000);
}

// ===== استعلام =====
export function getAchievementState(id) {
  const d = load();
  const ach = ACHIEVEMENTS.find(a => a.id === id);
  if (!ach) return null;
  let progress = 0;
  try { progress = ach.getProgress(); } catch (e) {}
  return {
    ...ach,
    progress: Math.min(progress, ach.target),
    unlocked: !!d.unlocked[id],
    unlockedAt: d.unlocked[id]?.unlockedAt || null,
  };
}

export function getAllAchievements() {
  return ACHIEVEMENTS.map(a => getAchievementState(a.id));
}

export function getUnlockedCount() {
  return Object.keys(load().unlocked).length;
}

export function getTotalCount() {
  return ACHIEVEMENTS.length;
}

// ===== شارة "إنجازات جاهزة للفتح" على القائمة =====
// تعد كم إنجاز وصل 100% بس ما اتفتح بعد (نظرياً يجب أن لا يحدث، لكن للأمان)
export function getReadyToUnlockCount() {
  let count = 0;
  for (const a of getAllAchievements()) {
    if (!a.unlocked && a.progress >= a.target) count++;
  }
  return count;
}
