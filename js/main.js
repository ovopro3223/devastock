// ===== نقطة الدخول =====
import { initHome, refreshHomeRank } from './pages/home.js';
import { initMenu }    from './pages/menu.js';
import { initModes }   from './pages/modes.js';
import { initStock }   from './pages/stock.js';
import { initMuseum }  from './pages/museum.js';
import { initProfile } from './pages/profile.js';
import { initForum }   from './pages/forum.js';
import { initSettings } from './pages/settings.js';
import { initAudio }   from './core/audio.js';
import { startBgRain } from './utils/bg-rain.js';
import { initAuth }    from './core/firebase.js';
import { renderAuthButton } from './core/auth-ui.js';

const PAGE_IDS = [
  'home', 'menu', 'modes', 'letter-rain', 'letter-blaze',
  'stock', 'museum', 'museum-cat', 'profile', 'community', 'forum', 'casino',
  'taxi', 'fishing', 'sniper', 'settings',
];

const GAME_PAGES = ['letter-rain', 'letter-blaze', 'taxi', 'fishing', 'sniper', 'casino'];

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
  casino: 'modes',
  taxi: 'modes',
  fishing: 'modes',
  sniper: 'modes',
  'letter-rain': 'modes',
  'letter-blaze': 'modes',
};

let _currentPage = 'home';

export function showPage(pageId) {
  _currentPage = pageId;
  PAGE_IDS.forEach(id => {
    const el = document.getElementById(`page-${id}`);
    if (el) el.classList.toggle('active', id === pageId);
  });
  document.body.classList.toggle('in-game', GAME_PAGES.includes(pageId));
  if (pageId === 'home') refreshHomeRank();

  // تحديث زر التنقل العلوي
  const topnavBtn = document.getElementById('topnav-btn');
  if (topnavBtn) {
    if (pageId === 'home') {
      topnavBtn.hidden = true;
    } else {
      topnavBtn.hidden = false;
      topnavBtn.textContent = '←'; // سهم رجوع
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

// تهيئة الصفحات
initHome(showPage);
initMenu(showPage);
initModes(showPage);
initStock();
initMuseum(showPage);
initProfile(showPage);
initSettings();

// Firebase — يعمل بشكل مستقل في الخلفية
initAudio();
initAuth((user) => {
  renderAuthButton(user);
  if (user) refreshHomeRank();
});

initForum(showPage);
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
