// ===== مركز الإشعارات =====
import {
  auth,
  listenForNotifications,
  listenForGlobalNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
} from '../core/firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { showGameConfirm } from '../core/dialogs.js';
import { showGameNotification } from '../core/notifications.js';

let _userNotifs = [];
let _globalNotifs = [];
let _seenGlobalIds = new Set(_loadSeenGlobalIds());
let _currentUid = null;
let _userUnsub = null;
let _globalUnsub = null;
let _navigate = null;

const ICONS = {
  friend_request:  '👥',
  friend_accepted: '🤝',
  wall_post:       '📝',
  chat_message:    '💬',
  forum_like:      '❤️',
  forum_comment:   '💭',
  admin_broadcast: '📢',
  admin_gift:      '🎁',
};

function _loadSeenGlobalIds() {
  try {
    return JSON.parse(localStorage.getItem('devastock_seen_global_notifs') || '[]');
  } catch {
    return [];
  }
}

function _saveSeenGlobalIds() {
  try {
    localStorage.setItem('devastock_seen_global_notifs', JSON.stringify(Array.from(_seenGlobalIds)));
  } catch {}
}

function _timeAgo(date) {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `قبل ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} س`;
  if (diff < 604800) return `قبل ${Math.floor(diff / 86400)} يوم`;
  return date.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' });
}

function _escape(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function _mergedNotifs() {
  // ادمج إشعارات المستخدم + الإشعارات العامة، رتّبها حسب الوقت
  const globals = _globalNotifs.map(g => ({
    ...g,
    _isGlobal: true,
    read: _seenGlobalIds.has(g.id),
  }));
  const all = [..._userNotifs, ...globals];
  all.sort((a, b) => {
    const ta = (a.createdAtMs ?? a.createdAt?.getTime?.() ?? 0);
    const tb = (b.createdAtMs ?? b.createdAt?.getTime?.() ?? 0);
    return tb - ta;
  });
  return all;
}

function _unreadCount() {
  return _mergedNotifs().filter(n => !n.read).length;
}

function _renderBadge() {
  const badge = document.getElementById('notif-bell-badge');
  const bell = document.getElementById('notif-bell-btn');
  const count = _unreadCount();
  if (badge) {
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }
  // أظهر الجرس فقط إذا في مستخدم مسجل
  if (bell) bell.hidden = !_currentUid;
}

function _renderList() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  const items = _mergedNotifs();
  if (items.length === 0) {
    list.innerHTML = `<div class="notif-empty">ما عندك إشعارات حالياً</div>`;
    return;
  }
  list.innerHTML = items.map(n => {
    const icon = ICONS[n.type] || '🔔';
    const text = _formatText(n);
    const unread = n.read ? '' : 'unread';
    const delBtn = n._isGlobal ? '' : `<button class="notif-item-delete" data-del="${n.id}" title="حذف">×</button>`;
    return `
      <div class="notif-item ${unread}" data-id="${n.id}" data-global="${n._isGlobal ? '1' : '0'}" data-type="${n.type || ''}" data-from="${n.fromUid || ''}">
        <div class="notif-item-icon">${icon}</div>
        <div class="notif-item-body">
          <div class="notif-item-text">${text}</div>
          <div class="notif-item-time">${_timeAgo(n.createdAt)}</div>
        </div>
        ${delBtn}
      </div>
    `;
  }).join('');

  // event delegation — يثبت مرة واحدة
  if (!list._delegationAttached) {
    list.addEventListener('click', async (e) => {
      // زر الحذف الفردي
      const delBtn = e.target.closest('[data-del]');
      if (delBtn) {
        e.stopPropagation();
        const id = delBtn.dataset.del;
        if (_currentUid && id) {
          await deleteNotification(_currentUid, id);
        }
        return;
      }
      // نقر على إشعار كامل
      const item = e.target.closest('.notif-item');
      if (!item) return;
      const id = item.dataset.id;
      const isGlobal = item.dataset.global === '1';
      const type = item.dataset.type;
      const fromUid = item.dataset.from;

      if (isGlobal) {
        _seenGlobalIds.add(id);
        _saveSeenGlobalIds();
        _renderBadge();
        _renderList();
      } else if (_currentUid) {
        await markNotificationRead(_currentUid, id);
      }
      _openNotificationContext(type, fromUid);
    });
    list._delegationAttached = true;
  }
}

function _formatText(n) {
  const from = _escape(n.fromName || 'لاعب');
  switch (n.type) {
    case 'friend_request':
      return `<strong>${from}</strong> بعتلك طلب صداقة`;
    case 'friend_accepted':
      return `<strong>${from}</strong> قبل طلب صداقتك`;
    case 'wall_post':
      return `<strong>${from}</strong> كتب على حائطك: <em>${_escape(n.preview || '').slice(0, 60)}</em>`;
    case 'chat_message':
      return `<strong>${from}</strong> بعتلك رسالة: <em>${_escape(n.preview || '').slice(0, 60)}</em>`;
    case 'forum_like':
      return `<strong>${from}</strong> أعجبه منشورك بالمنتدى`;
    case 'forum_comment':
      return `<strong>${from}</strong> علّق على منشورك: <em>${_escape(n.preview || '').slice(0, 60)}</em>`;
    case 'admin_broadcast':
      return `<strong>📢 من الإدارة</strong>: ${_escape(n.message || n.preview || '')}`;
    case 'admin_gift':
      return `<strong>🎁 من الإدارة</strong>: ${_escape(n.message || 'وصلتك هدية')}`;
    default:
      return _escape(n.message || n.preview || 'إشعار جديد');
  }
}

function _openNotificationContext(type, fromUid) {
  // أغلق المودال
  const modal = document.getElementById('notif-modal');
  if (modal) modal.hidden = true;

  if (!fromUid) return;

  // افتح بروفايل المرسل عند معظم الأنواع
  if (['friend_request', 'friend_accepted', 'wall_post', 'chat_message', 'forum_like', 'forum_comment'].includes(type)) {
    if (typeof window._viewProfile === 'function') {
      window._viewProfile(fromUid);
    }
  }
}

function _openModal() {
  const modal = document.getElementById('notif-modal');
  if (!modal) return;
  modal.hidden = false;
  _renderList();
}

function _closeModal() {
  const modal = document.getElementById('notif-modal');
  if (modal) modal.hidden = true;
}

function _stopListeners() {
  if (_userUnsub) { _userUnsub(); _userUnsub = null; }
  if (_globalUnsub) { _globalUnsub(); _globalUnsub = null; }
}

function _startListeners(uid) {
  _stopListeners();
  _userUnsub = listenForNotifications(uid, (items) => {
    _userNotifs = items;
    _renderBadge();
    if (!document.getElementById('notif-modal')?.hidden) _renderList();
  });
  _globalUnsub = listenForGlobalNotifications((items) => {
    _globalNotifs = items;
    _renderBadge();
    if (!document.getElementById('notif-modal')?.hidden) _renderList();
  });
}

export function initNotifications(navigate) {
  _navigate = navigate;

  const bell = document.getElementById('notif-bell-btn');
  const modal = document.getElementById('notif-modal');
  const closeBtn = document.getElementById('notif-modal-close');
  const overlay = modal?.querySelector('.auth-modal-overlay');
  const markAllBtn = document.getElementById('notif-mark-all-read');
  const clearAllBtn = document.getElementById('notif-clear-all');

  if (bell) bell.addEventListener('click', _openModal);
  if (closeBtn) closeBtn.addEventListener('click', _closeModal);
  if (overlay) overlay.addEventListener('click', _closeModal);

  // backup: لو document delegation فتح المودال، نعرض القائمة
  document.addEventListener('notif-open', () => {
    _renderList();
  });

  if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
      if (_currentUid) await markAllNotificationsRead(_currentUid);
      // كل العامة المعروضة → مقروءة
      for (const g of _globalNotifs) _seenGlobalIds.add(g.id);
      _saveSeenGlobalIds();
      _renderBadge();
      _renderList();
    });
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', async () => {
      const ok = await showGameConfirm('مسح كل إشعاراتك؟');
      if (!ok) return;
      try {
        if (_currentUid) await clearAllNotifications(_currentUid);
        for (const g of _globalNotifs) _seenGlobalIds.add(g.id);
        _saveSeenGlobalIds();
        // تحديث فوري للواجهة (الـsnapshot listener رح يحدّث _userNotifs لاحقاً)
        _userNotifs = [];
        _renderBadge();
        _renderList();
      } catch (e) {
        showGameNotification('فشل المسح — تأكد من الاتصال', 'error');
      }
    });
  }

  // استمع لتغيّر حالة الدخول
  onAuthStateChanged(auth, (user) => {
    _currentUid = user?.uid || null;
    _userNotifs = [];
    _stopListeners();
    if (_currentUid) {
      _startListeners(_currentUid);
    }
    _renderBadge();
  });
}
