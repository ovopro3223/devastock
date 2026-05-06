// ===== لوحة الأدمن (UI) =====
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  isAdmin, sendLettersTo,
  getPlayerFullData, clearPlayerStock, setPlayerLifetimeTotal,
  grantFrameTo, setPlayerBanned,
  sendBroadcast, adminDeleteForumPost, getRecentForumPosts,
} from '../core/admin.js';
import { getPlayers } from '../core/firebase.js';

const ARABIC_LETTERS = ['ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي'];

let _initialized = false;
let _currentTab = 'letters';
let _selectedPlayerData = null;

export function initAdmin() {
  if (_initialized) return;
  _initialized = true;

  const openBtn = document.getElementById('admin-open-btn');
  const modal = document.getElementById('admin-modal');
  const closeBtn = document.getElementById('admin-modal-close');
  const overlay = modal?.querySelector('.admin-modal-overlay');

  // ابدأ مخفي
  if (openBtn) {
    openBtn.hidden = true;
    openBtn.style.display = 'none';
  }

  // مراقبة تسجيل الدخول
  const auth = getAuth();
  onAuthStateChanged(auth, (user) => {
    if (!openBtn) return;
    const showIt = isAdmin(user);
    openBtn.hidden = !showIt;
    openBtn.style.display = showIt ? '' : 'none';
  });

  if (openBtn && modal) {
    openBtn.addEventListener('click', () => {
      modal.hidden = false;
      _populatePlayerSelects();
    });
  }
  if (closeBtn && modal) closeBtn.addEventListener('click', () => modal.hidden = true);
  if (overlay && modal) overlay.addEventListener('click', () => modal.hidden = true);

  // التبويبات
  document.querySelectorAll('.admin-tab').forEach(t => {
    t.addEventListener('click', () => {
      _currentTab = t.dataset.adminTab;
      _setActiveTab();
    });
  });

  // أزرار كل تبويب
  document.getElementById('admin-send-btn')?.addEventListener('click', _handleSendLetters);
  document.getElementById('admin-player-load-btn')?.addEventListener('click', _handleLoadPlayer);
  document.getElementById('admin-broadcast-btn')?.addEventListener('click', _handleBroadcast);
  document.getElementById('admin-forum-load-btn')?.addEventListener('click', _handleLoadForumPosts);

  // أزرار إجراءات اللاعب
  document.querySelectorAll('[data-admin-action]').forEach(btn => {
    btn.addEventListener('click', () => _handlePlayerAction(btn.dataset.adminAction));
  });
}

function _setActiveTab() {
  document.querySelectorAll('.admin-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.adminTab === _currentTab)
  );
  document.querySelectorAll('.admin-tab-content').forEach(c =>
    c.hidden = c.dataset.adminContent !== _currentTab
  );
}

async function _populatePlayerSelects() {
  const sel1 = document.getElementById('admin-player-select');
  const sel2 = document.getElementById('admin-player2-select');
  const opts1 = sel1 ? '<option value="">— جاري التحميل... —</option>' : '';
  const opts2 = sel2 ? '<option value="">— جاري التحميل... —</option>' : '';
  if (sel1) sel1.innerHTML = opts1;
  if (sel2) sel2.innerHTML = opts2;

  try {
    const players = await getPlayers();
    const optionsHtml = '<option value="">— اختر لاعب —</option>' +
      players.map(p => `<option value="${p.uid}">${_esc(p.displayName)} (لفل ${p.score})</option>`).join('');
    if (sel1) sel1.innerHTML = optionsHtml;
    if (sel2) sel2.innerHTML = optionsHtml;
  } catch (e) {
    if (sel1) sel1.innerHTML = '<option value="">⚠️ فشل التحميل</option>';
    if (sel2) sel2.innerHTML = '<option value="">⚠️ فشل التحميل</option>';
  }
}

// ===== تبويب الأحرف =====
async function _handleSendLetters() {
  const target = document.getElementById('admin-player-select')?.value;
  const letter = document.getElementById('admin-letter-select')?.value;
  const amount = parseInt(document.getElementById('admin-amount')?.value || '0', 10);
  const result = document.getElementById('admin-result');

  if (!target) { _setResult(result, '⚠️ اختر لاعب', 'error'); return; }
  if (!letter) { _setResult(result, '⚠️ اختر حرف', 'error'); return; }
  if (!amount || amount <= 0) { _setResult(result, '⚠️ الكمية غير صحيحة', 'error'); return; }

  let letters = {};
  if (letter === '__ALL__') for (const c of ARABIC_LETTERS) letters[c] = amount;
  else letters[letter] = amount;

  _setResult(result, '... جاري الإرسال', 'pending');
  const r = await sendLettersTo(target, letters);
  if (r.ok) {
    const total = Object.values(letters).reduce((s, n) => s + n, 0);
    _setResult(result, `✅ ${total} حرف بطريقها للاعب`, 'success');
  } else {
    _setResult(result, `❌ فشل: ${r.error || 'unknown'}`, 'error');
  }
}

// ===== تبويب اللاعب =====
async function _handleLoadPlayer() {
  const target = document.getElementById('admin-player2-select')?.value;
  const info = document.getElementById('admin-player-info');
  const actions = document.getElementById('admin-player-actions');
  const result = document.getElementById('admin-player-result');
  if (!target) { _setResult(result, '⚠️ اختر لاعب', 'error'); return; }

  _setResult(result, '... جاري التحميل', 'pending');
  const r = await getPlayerFullData(target);
  if (!r.ok) {
    _setResult(result, `❌ فشل: ${r.error}`, 'error');
    if (info) info.innerHTML = '';
    if (actions) actions.hidden = true;
    return;
  }

  _selectedPlayerData = { uid: target, ...r };
  const stockTotal = Object.values(r.user.stock || {}).reduce((s, n) => s + n, 0);
  const lifetimeTotal = Object.values(r.user.lifetime || {}).reduce((s, n) => s + n, 0);
  const studentCount = Object.keys(r.user.school?.students || {}).length;
  const banText = r.user.banned ? `<div class="admin-info-row danger">🚫 محظور: ${_esc(r.user.banReason || '—')}</div>` : '';

  if (info) {
    info.innerHTML = `
      <div class="admin-info-card">
        <div class="admin-info-row"><b>الاسم:</b> ${_esc(r.lb.displayName || r.user.profile?.name || '—')}</div>
        <div class="admin-info-row"><b>اللفل:</b> ${r.lb.score || 0} ${r.lb.rankTitle ? `(${_esc(r.lb.rankTitle)})` : ''}</div>
        <div class="admin-info-row"><b>المخزن:</b> ${stockTotal.toLocaleString('ar-EG')} حرف</div>
        <div class="admin-info-row"><b>إجمالي العمر:</b> ${lifetimeTotal.toLocaleString('ar-EG')} حرف</div>
        <div class="admin-info-row"><b>الإطار:</b> ${_esc(r.user.frames?.equipped || '—')}</div>
        <div class="admin-info-row"><b>طلاب المدرسة:</b> ${studentCount}</div>
        <div class="admin-info-row"><b>أصدقاء:</b> ${(r.user.friends || []).length}</div>
        ${banText}
      </div>
    `;
  }
  if (actions) actions.hidden = false;
  _setResult(result, '', '');
}

async function _handlePlayerAction(action) {
  const target = _selectedPlayerData?.uid;
  const result = document.getElementById('admin-player-result');
  if (!target) { _setResult(result, '⚠️ حمّل بيانات لاعب أولاً', 'error'); return; }

  if (action === 'clear-stock') {
    if (!confirm('تصفير مخزن اللاعب؟')) return;
    _setResult(result, '... جاري', 'pending');
    const r = await clearPlayerStock(target);
    _setResult(result, r.ok ? '✅ تم تصفير المخزن' : `❌ ${r.error}`, r.ok ? 'success' : 'error');
    if (r.ok) _handleLoadPlayer();
    return;
  }

  if (action === 'set-lifetime') {
    const val = parseInt(document.getElementById('admin-set-lifetime-input')?.value || '0', 10);
    if (val < 0) { _setResult(result, '⚠️ قيمة غير صحيحة', 'error'); return; }
    if (!confirm(`ضبط إجمالي حروف العمر للاعب على ${val.toLocaleString('ar-EG')}؟`)) return;
    _setResult(result, '... جاري', 'pending');
    const r = await setPlayerLifetimeTotal(target, val);
    _setResult(result, r.ok ? '✅ تم ضبط اللفل' : `❌ ${r.error}`, r.ok ? 'success' : 'error');
    if (r.ok) _handleLoadPlayer();
    return;
  }

  if (action === 'grant-frame') {
    const frameId = document.getElementById('admin-grant-frame-select')?.value;
    if (!frameId) { _setResult(result, '⚠️ اختر إطار', 'error'); return; }
    _setResult(result, '... جاري', 'pending');
    const r = await grantFrameTo(target, frameId);
    _setResult(result, r.ok ? `✅ تم منح إطار "${frameId}"` : `❌ ${r.error}`, r.ok ? 'success' : 'error');
    if (r.ok) _handleLoadPlayer();
    return;
  }

  if (action === 'toggle-ban') {
    const isBanned = !!_selectedPlayerData?.user?.banned;
    let reason = '';
    if (!isBanned) {
      reason = prompt('سبب الحظر (اختياري):') || '';
    }
    if (!confirm(isBanned ? 'فك حظر اللاعب؟' : 'حظر هذا اللاعب؟')) return;
    _setResult(result, '... جاري', 'pending');
    const r = await setPlayerBanned(target, !isBanned, reason);
    _setResult(result, r.ok ? `✅ ${isBanned ? 'تم فك الحظر' : 'تم الحظر'}` : `❌ ${r.error}`, r.ok ? 'success' : 'error');
    if (r.ok) _handleLoadPlayer();
    return;
  }
}

// ===== تبويب الإعلان =====
async function _handleBroadcast() {
  const msg = document.getElementById('admin-broadcast-msg')?.value || '';
  const result = document.getElementById('admin-broadcast-result');
  if (!msg.trim()) { _setResult(result, '⚠️ اكتب رسالة', 'error'); return; }
  if (!confirm('إرسال الإعلان لكل اللاعبين؟')) return;

  _setResult(result, '... جاري', 'pending');
  const r = await sendBroadcast(msg);
  if (r.ok) {
    _setResult(result, '✅ تم البث — كل لاعب يفتح اللعبة رح يستلمه', 'success');
    document.getElementById('admin-broadcast-msg').value = '';
  } else {
    _setResult(result, `❌ ${r.error}`, 'error');
  }
}

// ===== تبويب المنتدى =====
async function _handleLoadForumPosts() {
  const list = document.getElementById('admin-forum-list');
  const result = document.getElementById('admin-forum-result');
  if (list) list.innerHTML = '<div style="color:#888">... جاري التحميل</div>';

  const r = await getRecentForumPosts(50);
  if (!r.ok) {
    if (list) list.innerHTML = `<div style="color:#FF8A80">❌ ${r.error}</div>`;
    return;
  }
  if (r.posts.length === 0) {
    if (list) list.innerHTML = '<div style="color:#888">لا منشورات</div>';
    return;
  }
  if (list) {
    list.innerHTML = r.posts.map(p => `
      <div class="admin-forum-item">
        <div class="admin-forum-item-meta">
          <b>${_esc(p.authorName || 'مجهول')}</b>
          <span>${p.category || 'general'}</span>
        </div>
        <div class="admin-forum-item-text">${_esc((p.content || '').slice(0, 200))}${(p.content || '').length > 200 ? '...' : ''}</div>
        <button class="admin-action-btn ban-btn" data-admin-delete-post="${p.id}">🗑️ حذف</button>
      </div>
    `).join('');
    list.querySelectorAll('[data-admin-delete-post]').forEach(btn => {
      btn.addEventListener('click', () => _handleDeleteForumPost(btn.dataset.adminDeletePost));
    });
  }
  _setResult(result, '', '');
}

async function _handleDeleteForumPost(postId) {
  if (!confirm('حذف هذا المنشور نهائياً؟')) return;
  const result = document.getElementById('admin-forum-result');
  _setResult(result, '... جاري', 'pending');
  const r = await adminDeleteForumPost(postId);
  if (r.ok) {
    _setResult(result, '✅ تم الحذف', 'success');
    _handleLoadForumPosts();
  } else {
    _setResult(result, `❌ ${r.error}`, 'error');
  }
}

function _setResult(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = `admin-result ${type}`;
}

function _esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
