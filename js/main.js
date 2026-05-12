// ===== نقطة الدخول =====
import { initHome, refreshHomeRank } from './pages/home.js';
import { initMenu }    from './pages/menu.js';
import { initModes }   from './pages/modes.js';
import { initStock }   from './pages/stock.js';
import { initMuseum }  from './pages/museum.js';
import { initProfile } from './pages/profile.js';
import { initForum }   from './pages/forum.js';
import { initCommunity } from './pages/community.js';
import { initNotifications } from './pages/notifications.js';
import { initSettings } from './pages/settings.js';
import { initChallenges, updateChallengesBadge, renderChallenges } from './pages/challenges.js';
import { playPageOpeningSound } from './core/audio.js';
import { initAchievements, renderAchievements } from './pages/achievements.js';
import { initTrade, renderTrade } from './pages/trade.js';
import { initHomeLeaderboard, refreshHomeLeaderboard } from './pages/home-leaderboard.js';
import { initSchool, renderSchool, stopSchoolRefresh } from './pages/school.js';
import { tickIncome } from './core/school-storage.js';
import { initFrames, renderFrames } from './pages/frames.js';
import { initAdmin } from './pages/admin.js';
import { checkForBroadcast, checkIfBanned } from './core/admin.js';
import { signOutUser } from './core/firebase.js';
import { initAudio, startAmbient, stopAmbient, isMusicEnabled, isMuted }   from './core/audio.js';
import { showGameNotification } from './core/notifications.js';
import { startBgRain } from './utils/bg-rain.js';
import { initAuth }    from './core/firebase.js';
import { renderAuthButton } from './core/auth-ui.js';
import { syncLifetimeWithStock } from './core/lifetime-storage.js';

const PAGE_IDS = [
  'home', 'menu', 'modes', 'letter-rain', 'letter-blaze',
  'stock', 'museum', 'museum-cat', 'profile', 'community', 'forum', 'casino',
  'taxi', 'fishing', 'sniper', 'settings', 'achievements', 'challenges', 'trade',
  'school', 'frames',
];

const GAME_PAGES = ['letter-rain', 'letter-blaze', 'taxi', 'fishing', 'sniper'];

// أهداف الرجوع لكل صفحة (لزر التنقل العلوي)
const BACK_TARGETS = {
  menu: 'home',
  modes: 'menu',
  stock: 'menu',
  museum: 'menu',
  'museum-cat': 'museum',
  profile: 'menu',
  community: 'menu',
  forum: 'menu',
  settings: 'menu',
  achievements: 'menu',
  challenges: 'menu',
  trade: 'menu',
  school: 'menu',
  frames: 'menu',
  casino: 'modes',
  taxi: 'modes',
  fishing: 'modes',
  sniper: 'modes',
  'letter-rain': 'modes',
  'letter-blaze': 'modes',
};

let _currentPage = 'home';

export function showPage(pageId) {
  playPageOpeningSound();
  _currentPage = pageId;
  PAGE_IDS.forEach(id => {
    const el = document.getElementById(`page-${id}`);
    if (el) el.classList.toggle('active', id === pageId);
  });
  const isGamePage = GAME_PAGES.includes(pageId);
  document.body.classList.toggle('in-game', isGamePage);
  if (isGamePage) {
    stopAmbient();
  } else if (isMusicEnabled() && !isMuted()) {
    startAmbient();
  }
  if (pageId === 'home') refreshHomeRank();
  if (pageId === 'menu') updateChallengesBadge();
  if (pageId === 'challenges') renderChallenges();
  if (pageId === 'achievements') renderAchievements();
  if (pageId === 'trade') renderTrade();
  if (pageId === 'school') renderSchool();
  else stopSchoolRefresh();
  if (pageId === 'frames') renderFrames();
  document.dispatchEvent(new CustomEvent('page-show', { detail: pageId }));

  // تحديث زر التنقل العلوي
  const topnavBtn = document.getElementById('topnav-btn');
  if (topnavBtn) {
    if (pageId === 'home') {
      topnavBtn.hidden = true;
    } else {
      topnavBtn.hidden = false;
      topnavBtn.textContent = 'رجوع';
      topnavBtn.title = 'رجوع';
    }
  }

}

document.querySelectorAll('.btn-back').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    if (target) showPage(target);
  });
});

// مزامنة lifetime مع stock قبل أي شيء يعتمد على اللفل
syncLifetimeWithStock();

// تهيئة الصفحات
initHome(showPage);
initMenu(showPage);
initModes(showPage);
initStock();
initMuseum(showPage);
initProfile(showPage);
initSettings();
initChallenges();
initAchievements();
initTrade();
initHomeLeaderboard();
initSchool(showPage);
initFrames(showPage);
initAdmin();

// تنفيذ tick أولي عند فتح التطبيق — يحسب الإنتاج التلقائي حتى أوفلاين
tickIncome();

// Firebase — يعمل بشكل مستقل في الخلفية
initAudio();
initAuth(async (user) => {
  // فحص حظر اللاعب فور تسجيل دخوله
  if (user) {
    const banResult = await checkIfBanned();
    if (banResult.banned) {
      showGameNotification(`🚫 حسابك محظور.${banResult.reason ? '\nالسبب: ' + banResult.reason : ''}`, 'error');
      signOutUser();
      return;
    }
    // فحص الإعلانات الجديدة
    const announcement = await checkForBroadcast();
    if (announcement) {
      setTimeout(() => showGameNotification(`📢 إعلان من الإدارة:\n\n${announcement}`, 'info'), 1200);
    }
  }
  // بعد سحب البيانات من السحابة، تأكد إن lifetime ≥ stock
  syncLifetimeWithStock();
  renderAuthButton(user);
  if (user) refreshHomeRank();
});

initForum(showPage);
initCommunity(showPage);
initNotifications(showPage);
startBgRain('home-canvas');
startBgRain('menu-canvas');
showPage('home');

// زر التنقل العلوي (يمين) — رجوع
const topnavBtn = document.getElementById('topnav-btn');
if (topnavBtn) {
  topnavBtn.addEventListener('click', () => {
    const target = BACK_TARGETS[_currentPage] || 'home';
    showPage(target);
  });
}

const loader = document.getElementById('app-loading');
if (loader) {
  loader.classList.add('app-loading-hidden');
  setTimeout(() => { loader.hidden = true; }, 400);
}
