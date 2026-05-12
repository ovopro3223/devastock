// ===== صفحة متجر الإطارات 🖼 =====
import { FRAMES, getFrameById, getFrameUrl, RARITY_INFO } from '../core/frames-data.js';
import {
  getOwnedFrames, isFrameOwned, getEquippedFrameId,
  purchaseFrame, equipFrame, unequipFrame,
} from '../core/frames-storage.js';
import { getStock } from '../core/storage.js';
import { getLifetimeTotal, getLevel } from '../core/lifetime-storage.js';

let _activeTab = 'all';
const fmt = n => Math.floor(n).toLocaleString('ar-EG');

export function initFrames(showPage) {
  const cardBtn = document.getElementById('btn-frames-menu');
  if (cardBtn) cardBtn.addEventListener('click', () => showPage('frames'));

  document.querySelectorAll('.frames-tab').forEach(t =>
    t.addEventListener('click', () => {
      _activeTab = t.dataset.framesTab;
      _setActiveTab();
      _renderGrid();
    })
  );
}

function _setActiveTab() {
  document.querySelectorAll('.frames-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.framesTab === _activeTab)
  );
}

export function renderFrames() {
  _renderSummary();
  _renderGrid();
}

function _renderSummary() {
  const eq = getEquippedFrameId();
  const eqName = eq ? getFrameById(eq)?.name || 'بدون' : 'بدون إطار';
  const balance = Object.values(getStock()).reduce((s, n) => s + n, 0);

  const cur = document.getElementById('frames-current');
  const bal = document.getElementById('frames-balance');
  if (cur) cur.textContent = eqName;
  if (bal) bal.textContent = fmt(balance);
}

function _renderGrid() {
  const grid = document.getElementById('frames-grid');
  if (!grid) return;

  let frames = FRAMES.slice();
  if (_activeTab === 'owned') frames = frames.filter(f => isFrameOwned(f.id));
  else if (_activeTab === 'locked') frames = frames.filter(f => !isFrameOwned(f.id));

  if (frames.length === 0) {
    grid.innerHTML = `<div class="frames-empty">لا إطارات في هذه الفئة</div>`;
    return;
  }

  const stock = getStock();
  const balance = Object.values(stock).reduce((s, n) => s + n, 0);
  const level = getLevel(getLifetimeTotal());
  const equippedId = getEquippedFrameId();

  grid.innerHTML = frames.map(f => {
    const owned = isFrameOwned(f.id);
    const equipped = equippedId === f.id;
    const rarity = RARITY_INFO[f.rarity] || RARITY_INFO.common;
    const url = getFrameUrl(f);

    let badgeHtml = '';
    let actionHtml = '';

    if (equipped) {
      badgeHtml = `<span class="frame-badge equipped">✓ مرتدى</span>`;
      actionHtml = `<button class="frame-btn unequip" data-frame-action="unequip" data-frame="${f.id}">انزع</button>`;
    } else if (owned) {
      badgeHtml = `<span class="frame-badge owned">مملوك</span>`;
      actionHtml = `<button class="frame-btn equip" data-frame-action="equip" data-frame="${f.id}">ارتدي</button>`;
    } else if (f.cost === 0 && f.levelReq > 0) {
      // مجاني عند لفل معين
      const canUnlock = level >= f.levelReq;
      badgeHtml = `<span class="frame-badge level-req">لفل ${f.levelReq}</span>`;
      if (canUnlock) {
        actionHtml = `<button class="frame-btn unlock" data-frame-action="unlock-level" data-frame="${f.id}">افتح مجاناً</button>`;
      } else {
        actionHtml = `<button class="frame-btn locked" disabled>وصلت لفل ${level}/${f.levelReq}</button>`;
      }
    } else {
      const canAfford = balance >= f.cost;
      const priceClass = canAfford ? 'affordable' : 'locked';
      actionHtml = `<button class="frame-btn buy ${priceClass}" data-frame-action="buy" data-frame="${f.id}" ${canAfford ? '' : 'disabled'}>
        ${canAfford ? `اشتري بـ ${fmt(f.cost)}` : `يحتاج ${fmt(f.cost - balance)} حرف بعد`}
      </button>`;
    }

    return `
      <div class="frame-card rarity-${f.rarity} ${equipped ? 'is-equipped' : ''} ${owned ? 'is-owned' : 'is-locked'}">
        <div class="frame-preview">
          <div class="frame-avatar-placeholder">👤</div>
          <img class="frame-img" src="${url}" alt="${f.name}">
          ${badgeHtml}
        </div>
        <div class="frame-name" style="color: ${rarity.color}">${f.name}</div>
        <div class="frame-rarity">${rarity.label}</div>
        ${actionHtml}
      </div>
    `;
  }).join('');

  // ربط الأحداث
  grid.querySelectorAll('[data-frame-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.frameAction;
      const id = btn.dataset.frame;
      _handleAction(action, id);
    });
  });
}

async function _handleAction(action, id) {
  const frame = getFrameById(id);
  if (!frame) return;

  if (action === 'buy') {
    const result = purchaseFrame(id);
    if (result.ok) {
      // اشتراها — اسأل المستخدم لو يريد ارتداها
      const { showGameConfirm } = await import('../core/dialogs.js');
      const { showGameNotification } = await import('../core/notifications.js');
      if (await showGameConfirm(`تم شراء "${frame.name}". هل تريد ارتداءه الآن؟`)) {
        equipFrame(id);
      }
      _renderSummary();
      _renderGrid();
    } else if (result.reason === 'not_enough_letters') {
      const { showGameNotification } = await import('../core/notifications.js');
      showGameNotification(`بحاجة ${fmt(result.need)} حرف. عندك ${fmt(result.have || 0)}`, 'warning');
    } else if (result.reason === 'already_owned') {
      const { showGameNotification } = await import('../core/notifications.js');
      showGameNotification('هذا الإطار مملوك', 'info');
    }
  } else if (action === 'unlock-level') {
    // مجاني — مالك تلقائي عند لفل معين، فقط ارتديه
    equipFrame(id);
    _renderSummary();
    _renderGrid();
  } else if (action === 'equip') {
    equipFrame(id);
    _renderSummary();
    _renderGrid();
  } else if (action === 'unequip') {
    unequipFrame();
    _renderSummary();
    _renderGrid();
  }
}
