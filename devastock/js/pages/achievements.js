// ===== صفحة الإنجازات =====
import { getAllAchievements, getUnlockedCount, getTotalCount } from '../core/achievements.js';

let _activeTab = 'all';

export function initAchievements() {
  const tabs = document.querySelectorAll('#achievements-tabs .achievements-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _activeTab = tab.dataset.tab;
      renderAchievements();
    });
  });

  // أعد العرض كل مرة تفتح الصفحة (لتحديث التقدم)
  document.addEventListener('page-show', (e) => {
    if (e.detail === 'achievements') renderAchievements();
  });
}

export function renderAchievements() {
  const grid = document.getElementById('achievements-grid');
  if (!grid) return;

  const all = getAllAchievements();
  const total = getTotalCount();
  const unlocked = getUnlockedCount();
  const percent = total ? Math.round((unlocked / total) * 100) : 0;

  // ملخص أعلى الصفحة
  const unlockedEl = document.getElementById('achievements-unlocked-count');
  const totalEl    = document.getElementById('achievements-total-count');
  const percentEl  = document.getElementById('achievements-percent');
  if (unlockedEl) unlockedEl.textContent = unlocked;
  if (totalEl)    totalEl.textContent    = total;
  if (percentEl)  percentEl.textContent  = `${percent}%`;

  // فلترة
  let list = all;
  if (_activeTab === 'unlocked') list = all.filter(a => a.unlocked);
  if (_activeTab === 'locked')   list = all.filter(a => !a.unlocked);

  // تجميع حسب الفئة
  const categories = {
    letters: 'تجميع الحروف',
    level: 'اللفلات',
    games: 'الألعاب',
    'high-score': 'إنجازات داخل الألعاب',
    museum: 'المتحف',
    social: 'المجتمع',
  };

  const byCategory = {};
  for (const a of list) {
    if (!byCategory[a.category]) byCategory[a.category] = [];
    byCategory[a.category].push(a);
  }

  if (list.length === 0) {
    grid.innerHTML = `<div class="achievements-empty">لا توجد إنجازات في هذه الفئة بعد.</div>`;
    return;
  }

  grid.innerHTML = Object.entries(categories)
    .filter(([cat]) => byCategory[cat])
    .map(([cat, label]) => {
      const items = byCategory[cat];
      return `
        <div class="achievements-category">
          <h3 class="achievements-category-title">${label}</h3>
          <div class="achievements-cards">
            ${items.map(a => _renderCard(a)).join('')}
          </div>
        </div>
      `;
    }).join('');
}

function _renderCard(a) {
  const percent = Math.min(100, Math.round((a.progress / a.target) * 100));
  const cls = a.unlocked ? 'achievement-card unlocked' : 'achievement-card';
  return `
    <div class="${cls}">
      <div class="achievement-icon ${a.unlocked ? '' : 'locked'}">${a.unlocked ? a.icon : '🔒'}</div>
      <div class="achievement-body">
        <div class="achievement-title">${a.title}</div>
        <div class="achievement-desc">${a.desc}</div>
        <div class="achievement-progress-bar">
          <div class="achievement-progress-fill" style="width: ${percent}%"></div>
        </div>
        <div class="achievement-progress-text">${a.progress} / ${a.target}</div>
      </div>
    </div>
  `;
}
