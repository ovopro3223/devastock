// ===== لوحة الأدمن (UI) =====
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { isAdmin, sendLettersTo } from '../core/admin.js';
import { getPlayers } from '../core/firebase.js';

const ARABIC_LETTERS = ['ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي'];

let _initialized = false;

export function initAdmin() {
  if (_initialized) return;
  _initialized = true;

  const openBtn  = document.getElementById('admin-open-btn');
  const modal    = document.getElementById('admin-modal');
  const closeBtn = document.getElementById('admin-modal-close');
  const overlay  = modal?.querySelector('.admin-modal-overlay');
  const sendBtn  = document.getElementById('admin-send-btn');
  const playerSel = document.getElementById('admin-player-select');

  // ابدأ مخفي دائماً (احتياط ضد أي flash)
  if (openBtn) {
    openBtn.hidden = true;
    openBtn.style.display = 'none';
  }

  // مراقبة حالة المصادقة — أظهر الزر للأدمن فقط
  const auth = getAuth();
  onAuthStateChanged(auth, (user) => {
    if (!openBtn) return;
    const showIt = isAdmin(user);
    openBtn.hidden = !showIt;
    openBtn.style.display = showIt ? '' : 'none';
  });

  if (openBtn && modal) {
    openBtn.addEventListener('click', async () => {
      modal.hidden = false;
      // املأ قائمة اللاعبين عند الفتح
      if (playerSel) {
        playerSel.innerHTML = '<option value="">— جاري التحميل... —</option>';
        try {
          const players = await getPlayers();
          playerSel.innerHTML = '<option value="">— اختر لاعب —</option>' +
            players.map(p => `<option value="${p.uid}">${escapeHtml(p.displayName)} (لفل ${p.score})</option>`).join('');
        } catch (e) {
          playerSel.innerHTML = '<option value="">⚠️ تعذّر التحميل</option>';
        }
      }
    });
  }

  if (closeBtn && modal) closeBtn.addEventListener('click', () => modal.hidden = true);
  if (overlay && modal)  overlay.addEventListener('click',  () => modal.hidden = true);

  if (sendBtn) {
    sendBtn.addEventListener('click', _handleSend);
  }
}

async function _handleSend() {
  const target = document.getElementById('admin-player-select')?.value;
  const letter = document.getElementById('admin-letter-select')?.value;
  const amount = parseInt(document.getElementById('admin-amount')?.value || '0', 10);
  const result = document.getElementById('admin-result');

  if (!target) { _setResult(result, '⚠️ اختر لاعب', 'error'); return; }
  if (!letter) { _setResult(result, '⚠️ اختر حرف', 'error'); return; }
  if (!amount || amount <= 0) { _setResult(result, '⚠️ الكمية غير صحيحة', 'error'); return; }

  let letters = {};
  if (letter === '__ALL__') {
    for (const c of ARABIC_LETTERS) letters[c] = amount;
  } else {
    letters[letter] = amount;
  }

  _setResult(result, '... جاري الإرسال', 'pending');
  const r = await sendLettersTo(target, letters);
  if (r.ok) {
    const total = Object.values(letters).reduce((s, n) => s + n, 0);
    _setResult(result, `✅ تم! ${total} حرف بطريقها للاعب (يستلمهم لما يفتح اللعبة)`, 'success');
  } else {
    _setResult(result, `❌ فشل: ${r.error || 'unknown'}`, 'error');
  }
}

function _setResult(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = `admin-result ${type}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
