// ===== صفحة التحديات =====
import { getChallengesState, claimChallenge, formatTimeLeft, getReadyChallengeCount } from '../core/challenges.js';
import { showGameNotification } from '../core/notifications.js';

let _initialized = false;

export function initChallenges() {
  if (_initialized) return;
  _initialized = true;

  document.addEventListener('page-show', (e) => {
    if (e.detail === 'challenges') renderChallenges();
  });
}

export function renderChallenges() {
  const state = getChallengesState();

  const dailyEl = document.getElementById('challenges-daily-list');
  const weeklyEl = document.getElementById('challenges-weekly-list');
  const dailyTimer = document.getElementById('challenges-daily-timer');
  const weeklyTimer = document.getElementById('challenges-weekly-timer');

  if (dailyTimer) dailyTimer.textContent = `يتجدد بعد ${formatTimeLeft(state.msUntilDailyReset)}`;
  if (weeklyTimer) weeklyTimer.textContent = `يتجدد بعد ${formatTimeLeft(state.msUntilWeeklyReset)}`;

  if (dailyEl) dailyEl.innerHTML = state.daily.map(_renderCard).join('') ||
    `<div class="challenges-empty">لا توجد تحديات اليوم.</div>`;
  if (weeklyEl) weeklyEl.innerHTML = state.weekly.map(_renderCard).join('') ||
    `<div class="challenges-empty">لا توجد تحديات هذا الأسبوع.</div>`;
}

function _renderCard(c) {
  const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
  const cls = ['challenge-card'];
  if (c.completed) cls.push('completed');
  if (c.claimed)   cls.push('claimed');

  let action;
  if (c.claimed) {
    action = `<button class="challenge-claim-btn claimed" disabled>تم الاستلام ✓</button>`;
  } else if (c.canClaim) {
    action = `<button class="challenge-claim-btn ready" onclick="window._claimChallenge('${c.id}')">استلام ${c.reward} حرف ✦</button>`;
  } else {
    action = `<div class="challenge-reward-label">المكافأة: ${c.reward} حرف</div>`;
  }

  return `
    <div class="${cls.join(' ')}">
      <div class="challenge-icon">${c.icon}</div>
      <div class="challenge-body">
        <div class="challenge-title">${c.title}</div>
        <div class="challenge-desc">${c.desc}</div>
        <div class="challenge-progress-bar">
          <div class="challenge-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="challenge-progress-text">${c.progress} / ${c.target}</div>
        ${action}
      </div>
    </div>
  `;
}

window._claimChallenge = function(tplId) {
  const result = claimChallenge(tplId);
  if (!result.ok) {
    if (result.reason === 'not_complete') showGameNotification('التحدي لم يكتمل بعد.', 'error');
    else if (result.reason === 'already_claimed') showGameNotification('تم استلام المكافأة سابقاً.', 'warning');
    else showGameNotification('تعذَّر استلام المكافأة.', 'error');
    return;
  }
  const grantedSummary = Object.entries(result.granted)
    .map(([c, n]) => `${c}×${n}`).join(' ');
  showGameNotification(`🎁 ربحت ${result.reward} حرف!\n${grantedSummary}`, 'success');
  renderChallenges();
  _updateMenuBadge();
};

export function updateChallengesBadge() {
  _updateMenuBadge();
}

function _updateMenuBadge() {
  const badge = document.getElementById('challenges-badge');
  if (!badge) return;
  const ready = getReadyChallengeCount();
  if (ready > 0) {
    badge.textContent = ready;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}
