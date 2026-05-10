// ===== منطق صفحة المتحف =====
import { MUSEUM_CATEGORIES, getLetterCost, canAfford } from '../core/museum-data.js';
import { isCollected, collectWord, getCategoryProgress } from '../core/museum-storage.js';
import { getStock, spendLetters } from '../core/storage.js';
import { incrementCounter } from '../core/achievements.js';
import { playMuseumWordsOpeningSound } from '../core/audio.js';

let _navigate   = null;
let _currentCat = null;

export function initMuseum(navigate) {
  _navigate = navigate;

  // زر رجوع من صفحة الفئة
  document.getElementById('btn-back-museum-cat')
    ?.addEventListener('click', () => {
      renderMuseumMain();
      _navigate('museum');
    });

}

// ===== صفحة الفئات الرئيسية =====
export function renderMuseumMain() {
  const grid = document.getElementById('museum-cats-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const stock = getStock();

  for (const cat of MUSEUM_CATEGORIES) {
    const { collected, total } = getCategoryProgress(cat.id, cat.words.length);
    const pct   = total > 0 ? Math.round((collected / total) * 100) : 0;

    // عدد الكلمات الجاهزة للاقتناء الآن
    const ready = cat.words.filter(w =>
      !isCollected(cat.id, w) && canAfford(w, stock)
    ).length;

    const card = document.createElement('div');
    card.className = 'museum-cat-card';
    card.style.setProperty('--cat-color', cat.color);

    const readyBadge = ready > 0
      ? `<span class="museum-cat-ready">${ready} جاهزة ✦</span>`
      : '';

    card.innerHTML = `
      <div class="museum-cat-icon">${cat.icon}</div>
      <div class="museum-cat-name">${cat.label}</div>
      ${readyBadge}
      <div class="museum-cat-progress">
        <div class="museum-progress-bar">
          <div class="museum-progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="museum-progress-text">${collected}/${total}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      _currentCat = cat;
      _renderCategory(cat);
      _navigate('museum-cat');   // ← _navigate وليس navigate
    });

    grid.appendChild(card);
  }
}

// ===== صفحة كلمات الفئة =====
function _renderCategory(cat) {
  const titleEl = document.getElementById('museum-cat-title');
  if (titleEl) titleEl.textContent = `${cat.icon} ${cat.label}`;

  const list = document.getElementById('museum-words-list');
  if (!list) return;
  list.innerHTML = '';

  const stock = getStock();

  // ترتيب: جاهزة أولاً ← ناقصة ← مقتناة
  const sorted = [...cat.words].sort((a, b) => {
    const ca = isCollected(cat.id, a);
    const cb = isCollected(cat.id, b);
    if (ca !== cb) return ca ? 1 : -1;           // المقتناة آخراً
    const aa = canAfford(a, stock);
    const ab = canAfford(b, stock);
    if (aa !== ab) return aa ? -1 : 1;            // الجاهزة أولاً
    return 0;
  });

  for (const word of sorted) {
    const collected  = isCollected(cat.id, word);
    const cost       = getLetterCost(word);
    const affordable = !collected && canAfford(word, stock);

    const card = document.createElement('div');
    card.className = [
      'museum-word-card',
      collected  ? 'collected'  : '',
      affordable ? 'affordable' : '',
    ].filter(Boolean).join(' ');
    card.style.setProperty('--cat-color', cat.color);

    if (collected) {
      card.innerHTML = `
        <div class="word-row">
          <span class="word-check">✓</span>
          <span class="word-text">${word}</span>
          <span class="word-collected-label">مقتنى</span>
        </div>
      `;
    } else {
      const chips = Object.entries(cost).map(([c, n]) => {
        const have = stock[c] || 0;
        const ok   = have >= n;
        const label = n > 1 ? `${c} ×${n}` : c;
        return `<span class="letter-chip ${ok ? 'ok' : 'missing'}" title="عندك ${have}">${label}</span>`;
      }).join('');

      card.innerHTML = `
        <div class="word-row">
          <span class="word-text">${word}</span>
          <button class="word-collect-btn" ${affordable ? '' : 'disabled'}>
            ${affordable ? 'اقتنِ ✦' : 'ناقصة'}
          </button>
        </div>
        <div class="word-chips">${chips}</div>
      `;

      if (affordable) {
        card.querySelector('.word-collect-btn').addEventListener('click', () => {
          spendLetters(cost);
          collectWord(cat.id, word);
          playMuseumWordsOpeningSound();
          incrementCounter('museum_words');
          _renderCategory(cat);
        });
      }
    }

    list.appendChild(card);
  }
}
