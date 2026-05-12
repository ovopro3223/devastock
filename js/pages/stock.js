// ===== صفحة مخزن الأحرف =====
import { getStock, clearStock } from '../core/storage.js';

const ARABIC_LETTERS = [
  'ا','ب','ت','ث','ج','ح','خ',
  'د','ذ','ر','ز','س','ش','ص',
  'ض','ط','ظ','ع','غ','ف','ق',
  'ك','ل','م','ن','ه','و','ي',
];

export function renderStock() {
  const stock = getStock();
  const total = Object.values(stock).reduce((s, n) => s + n, 0);

  const totalEl = document.getElementById('stock-total');
  if (totalEl) totalEl.textContent = total.toLocaleString('ar');

  const grid = document.getElementById('stock-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (const char of ARABIC_LETTERS) {
    const count = stock[char] || 0;
    const cell  = document.createElement('div');
    cell.className = 'stock-cell' + (count > 0 ? ' has-letters' : '');

    cell.innerHTML = `
      <span class="stock-char">${char}</span>
      <span class="stock-count">${count > 0 ? count : '·'}</span>
    `;
    grid.appendChild(cell);
  }
}

export function initStock() {
  document.getElementById('btn-clear-stock')
    ?.addEventListener('click', async () => {
      const { showGameConfirm } = await import('../core/dialogs.js');
      if (await showGameConfirm('هل تريد مسح جميع الأحرف المخزّنة؟')) {
        clearStock();
        renderStock();
      }
    });
}
