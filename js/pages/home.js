// ===== منطق الصفحة الرئيسية =====
import { getLifetimeTotal, getLevel, getLevelEmoji, getLevelProgress } from '../core/lifetime-storage.js';

export function initHome(navigate) {
  document.getElementById('btn-start')
    .addEventListener('click', () => navigate('menu'));
}

export function refreshHomeRank() {
  const badge = document.getElementById('home-rank-badge');
  const total = getLifetimeTotal();
  if (total === 0) { badge.hidden = true; return; }

  const level = getLevel(total);
  const emoji = getLevelEmoji(level);
  const { progress, required, percent } = getLevelProgress(total);

  badge.hidden = false;
  badge.innerHTML =
    `<span class="rank-emoji">${emoji}</span>` +
    `<span class="rank-label">لفل ${level}</span>` +
    `<span class="rank-sep">|</span>` +
    `<span class="rank-score">${progress}/${required} (${percent}%)</span>`;
}
