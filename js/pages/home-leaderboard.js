// ===== لوحة المتصدرين — modal يُفتح من بطاقة "المتصدرين" بالقائمة الرئيسية =====
import { getPlayers } from '../core/firebase.js';
import { getSeasonState } from '../core/seasons.js';
import { renderAvatarHtml } from '../core/avatar-helper.js';

let _allPlayers = [];
let _loaded = false;
let _widget = null;

const GAME_LABELS = {
  'letter-rain':  '🌧️ مطر الأحرف',
  'letter-blaze': '🔥 حريق الحروف',
  'taxi':          '🚕 التاكسي',
  'fishing':       '🎣 الصيد',
  'sniper':        '🎯 القنص',
  'casino':        '🎰 الكازينو',
};

export function initHomeLeaderboard() {
  // ===== widget الـ modal =====
  const listEl   = document.getElementById('lb-modal-list');
  const pickerEl = document.getElementById('lb-modal-game-picker');
  const selectEl = document.getElementById('lb-modal-game-select');

  if (!listEl) return; // الـmodal مش موجود

  _widget = {
    listEl,
    pickerEl,
    selectEl,
    currentTab: 'global',
    currentGame: 'letter-rain',
  };

  // ربط التبويبات
  document.querySelectorAll('[data-lb-tab][data-lb-scope="modal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      _widget.currentTab = btn.dataset.lbTab;
      _setActiveTab();
      _widget.pickerEl.hidden = _widget.currentTab !== 'game';
      _render();
    });
  });

  // ربط dropdown اللعبة
  if (selectEl) {
    selectEl.addEventListener('change', () => {
      _widget.currentGame = selectEl.value;
      _render();
    });
  }

  // ===== فتح/إغلاق modal =====
  const modal       = document.getElementById('lb-modal');
  const closeBtn    = document.getElementById('lb-modal-close');
  const overlay     = modal?.querySelector('.lb-modal-overlay');
  const menuCardBtn = document.getElementById('btn-leaderboard-menu');

  if (menuCardBtn && modal) {
    menuCardBtn.addEventListener('click', () => {
      modal.hidden = false;
      refreshHomeLeaderboard();
    });
  }
  if (closeBtn && modal) closeBtn.addEventListener('click', () => modal.hidden = true);
  if (overlay && modal)  overlay.addEventListener('click',  () => modal.hidden = true);
}

function _setActiveTab() {
  document.querySelectorAll('[data-lb-tab][data-lb-scope="modal"]').forEach(t =>
    t.classList.toggle('active', t.dataset.lbTab === _widget.currentTab)
  );
}

export async function refreshHomeLeaderboard() {
  if (!_widget) return;
  if (!_loaded) {
    _widget.listEl.innerHTML = `<div class="home-lb-empty">جاري التحميل...</div>`;
  }

  try {
    _allPlayers = await getPlayers();
    _loaded = true;
  } catch (e) {
    if (!_loaded) {
      _widget.listEl.innerHTML = `<div class="home-lb-empty">⚠️ تعذّر تحميل المتصدرين</div>`;
    }
    return;
  }

  _render();
}

function _render() {
  if (!_widget) return;
  const list = _widget.listEl;

  if (_allPlayers.length === 0) {
    list.innerHTML = `<div class="home-lb-empty">🌱 لا متصدرين بعد — كن أول!</div>`;
    return;
  }

  let sorted, valueExtractor;

  if (_widget.currentTab === 'global') {
    sorted = [..._allPlayers].sort((a, b) => (b.totalLetters || 0) - (a.totalLetters || 0));
    valueExtractor = p => `${(p.totalLetters || 0).toLocaleString('ar-EG')} حرف`;
  } else if (_widget.currentTab === 'season') {
    const state = getSeasonState();
    const sid = state.seasonId;
    sorted = _allPlayers
      .filter(p => p.seasonId === sid)
      .sort((a, b) => (b.seasonScore || 0) - (a.seasonScore || 0));
    valueExtractor = p => `${p.seasonScore || 0} نقطة`;
  } else {
    const gid = _widget.currentGame;
    sorted = _allPlayers
      .filter(p => p.gameStats && p.gameStats[gid] && (p.gameStats[gid].highScore || 0) > 0)
      .sort((a, b) => (b.gameStats[gid].highScore || 0) - (a.gameStats[gid].highScore || 0));
    valueExtractor = p => `${p.gameStats[gid].highScore || 0}`;
  }

  if (sorted.length === 0) {
    const msg = _widget.currentTab === 'season'
      ? 'لا متنافسون في هذا الموسم بعد'
      : _widget.currentTab === 'game'
        ? `لا أحد لعب ${GAME_LABELS[_widget.currentGame]} بعد`
        : 'لا متصدرين بعد';
    list.innerHTML = `<div class="home-lb-empty">🌱 ${msg}</div>`;
    return;
  }

  const top = sorted.slice(0, 10);
  list.innerHTML = top.map((p, i) => {
    const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    const avatarHtml = renderAvatarHtml({
      avatarImage: p.avatarImage,
      avatarEmoji: p.avatar,
      frameId: p.equippedFrame,
      wrapperClass: 'home-lb-avatar',
    });
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
