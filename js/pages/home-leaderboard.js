// ===== لوحة المتصدرين (مكوّن قابل لإعادة الاستخدام) =====
// يدعم أكثر من container — تستعمل في الواجهة الرئيسية وفي modal من القائمة
import { getPlayers } from '../core/firebase.js';
import { getSeasonState } from '../core/seasons.js';

let _allPlayers = [];
let _loaded = false;
const _widgets = [];

const GAME_LABELS = {
  'letter-rain':  '🌧️ مطر الأحرف',
  'letter-blaze': '🔥 حريق الحروف',
  'taxi':          '🚕 التاكسي',
  'fishing':       '🎣 الصيد',
  'sniper':        '🎯 القنص',
  'casino':        '🎰 الكازينو',
};

// إنشاء widget جديد. opts:
//   tabsScope: 'home' أو 'modal' (لتمييز الأزرار)
//   pickerEl, selectEl, listEl: عناصر DOM
function _createWidget({ scope, listEl, pickerEl, selectEl }) {
  const widget = {
    scope,
    listEl,
    pickerEl,
    selectEl,
    currentTab: 'global',
    currentGame: 'letter-rain',
  };

  // ربط التبويبات (تستعمل [data-lb-tab][data-lb-scope=...])
  document.querySelectorAll(`[data-lb-tab][data-lb-scope="${scope}"], .home-leaderboard [data-lb-tab]:not([data-lb-scope])`).forEach(btn => {
    if (scope === 'home' && btn.dataset.lbScope) return;
    if (scope === 'modal' && !btn.dataset.lbScope) return;
    btn.addEventListener('click', () => {
      widget.currentTab = btn.dataset.lbTab;
      _setActiveTab(widget);
      widget.pickerEl.hidden = widget.currentTab !== 'game';
      _renderInto(widget);
    });
  });

  // ربط dropdown اللعبة
  if (selectEl) {
    selectEl.addEventListener('change', () => {
      widget.currentGame = selectEl.value;
      _renderInto(widget);
    });
  }

  _widgets.push(widget);
  return widget;
}

function _setActiveTab(widget) {
  const tabs = widget.scope === 'home'
    ? document.querySelectorAll('.home-leaderboard [data-lb-tab]')
    : document.querySelectorAll('[data-lb-tab][data-lb-scope="modal"]');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.lbTab === widget.currentTab));
}

// ===== التهيئة =====
export function initHomeLeaderboard() {
  // ===== widget الواجهة الرئيسية =====
  _createWidget({
    scope: 'home',
    listEl:   document.getElementById('home-lb-list'),
    pickerEl: document.getElementById('home-lb-game-picker'),
    selectEl: document.getElementById('home-lb-game-select'),
  });

  // toggle الطي/الفتح للوحة الواجهة
  const toggleBtn = document.getElementById('home-lb-toggle');
  const homeLB = document.getElementById('home-leaderboard');
  if (toggleBtn && homeLB) {
    toggleBtn.addEventListener('click', () => {
      const isOpen = homeLB.classList.toggle('open');
      toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      // أول مرة تنفتح، اعمل refresh لو ما كان محمّل
      if (isOpen && !_loaded) refreshHomeLeaderboard();
    });
  }

  // ===== widget الـ modal =====
  _createWidget({
    scope: 'modal',
    listEl:   document.getElementById('lb-modal-list'),
    pickerEl: document.getElementById('lb-modal-game-picker'),
    selectEl: document.getElementById('lb-modal-game-select'),
  });

  // زر فتح/إغلاق modal
  const openBtn  = document.getElementById('lb-open-btn');
  const modal    = document.getElementById('lb-modal');
  const closeBtn = document.getElementById('lb-modal-close');
  const overlay  = modal?.querySelector('.lb-modal-overlay');

  if (openBtn && modal) {
    openBtn.addEventListener('click', () => {
      modal.hidden = false;
      // اعمل refresh عند فتح المودال — البيانات قد تكون قديمة
      refreshHomeLeaderboard();
    });
  }
  if (closeBtn && modal) closeBtn.addEventListener('click', () => modal.hidden = true);
  if (overlay && modal)  overlay.addEventListener('click', () => modal.hidden = true);
}

// تحميل اللاعبين وعرضهم في كل الـ widgets
export async function refreshHomeLeaderboard() {
  // أظهر "جاري التحميل" لو أول مرة
  if (!_loaded) {
    _widgets.forEach(w => {
      if (w.listEl) w.listEl.innerHTML = `<div class="home-lb-empty">جاري التحميل...</div>`;
    });
  }

  try {
    _allPlayers = await getPlayers();
    _loaded = true;
  } catch (e) {
    if (!_loaded) {
      _widgets.forEach(w => {
        if (w.listEl) w.listEl.innerHTML = `<div class="home-lb-empty">⚠️ تعذّر تحميل المتصدرين</div>`;
      });
    }
    return;
  }

  _widgets.forEach(_renderInto);
}

function _renderInto(widget) {
  const list = widget.listEl;
  if (!list) return;

  if (_allPlayers.length === 0) {
    list.innerHTML = `<div class="home-lb-empty">🌱 لا متصدرين بعد — كن أول!</div>`;
    return;
  }

  let sorted, valueExtractor;

  if (widget.currentTab === 'global') {
    sorted = [..._allPlayers].sort((a, b) => (b.totalLetters || 0) - (a.totalLetters || 0));
    valueExtractor = p => `${(p.totalLetters || 0).toLocaleString('ar-EG')} حرف`;
  } else if (widget.currentTab === 'season') {
    const state = getSeasonState();
    const sid = state.seasonId;
    sorted = _allPlayers
      .filter(p => p.seasonId === sid)
      .sort((a, b) => (b.seasonScore || 0) - (a.seasonScore || 0));
    valueExtractor = p => `${p.seasonScore || 0} نقطة`;
  } else {
    const gid = widget.currentGame;
    sorted = _allPlayers
      .filter(p => p.gameStats && p.gameStats[gid] && (p.gameStats[gid].highScore || 0) > 0)
      .sort((a, b) => (b.gameStats[gid].highScore || 0) - (a.gameStats[gid].highScore || 0));
    valueExtractor = p => `${p.gameStats[gid].highScore || 0}`;
  }

  if (sorted.length === 0) {
    const msg = widget.currentTab === 'season'
      ? 'لا متنافسون في هذا الموسم بعد'
      : widget.currentTab === 'game'
        ? `لا أحد لعب ${GAME_LABELS[widget.currentGame]} بعد`
        : 'لا متصدرين بعد';
    list.innerHTML = `<div class="home-lb-empty">🌱 ${msg}</div>`;
    return;
  }

  const top = sorted.slice(0, 10);
  list.innerHTML = top.map((p, i) => {
    const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    const avatarHtml = p.avatarImage
      ? `<img class="home-lb-avatar" src="${p.avatarImage}" alt="">`
      : `<div class="home-lb-avatar">${p.avatar || '👤'}</div>`;
    return `
      <div class="home-lb-row" onclick="window._viewProfile && window._viewProfile('${p.uid}')">
        <div class="home-lb-rank ${rankClass}">${rankIcon}</div>
        ${avatarHtml}
        <div class="home-lb-info">
          <div class="home-lb-name">${p.tierEmoji || '🥉'} ${_escape(p.displayName)}</div>
          <div class="home-lb-meta">${p.rankLabel || ''}</div>
        </div>
        <div class="home-lb-value">${valueExtractor(p)}</div>
      </div>
    `;
  }).join('');
}

function _escape(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
