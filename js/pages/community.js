// ===== صفحة المجتمع =====
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getState, setState, removeState } from '../core/app-state.js';
import { signInWithGoogle, getPlayers, getFriends, getIncomingRequests,
         getOutgoingRequests, sendFriendRequest, acceptFriendRequest,
         rejectFriendRequest, listenForIncomingRequests,
         listenForOutgoingRequests, getPlayerProfile,
         sendChatMessage, listenForMessages } from '../core/firebase.js';

let _chatListenerUnsub = null;
let _chatPartnerUid = null;
let _chatPartnerName = null;

let _currentUser = null;
let _allPlayers = [];
let _userFriends = [];
let _incomingRequests = [];
let _outgoingRequests = [];
let _activeTab = 'all';

function _friendRequestKey(fromUid, toUid) {
  return `friend_request_${fromUid}_${toUid}`;
}

function _hasSentRequest(fromUid, toUid) {
  return getState(_friendRequestKey(fromUid, toUid), null) === 'pending'
    || _outgoingRequests.some(r => r.toUid === toUid);
}

function _markRequestSent(fromUid, toUid) {
  setState(_friendRequestKey(fromUid, toUid), 'pending');
}

function _clearFriendRequest(fromUid, toUid) {
  removeState(_friendRequestKey(fromUid, toUid));
}

const auth = getAuth();

export function initCommunity(showPage) {

  // معالج التبويبات
  document.querySelectorAll('.community-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const tabName = e.target.dataset.tab;
      switchTab(tabName);
    });
  });

  // معالج البحث
  const searchInput = document.getElementById('community-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderTab(_activeTab);
    });
  }

  // إعداد الـ modal والـ Google button
  setupCommunityAuthModal();

  // الاستماع لتغييرات حالة المستخدم بشكل دائم
  onAuthStateChanged(auth, (user) => {
    _currentUser = user;
    console.log('Community auth state changed:', user ? `Logged in as ${user.displayName}` : 'Logged out');

    // أوقف الاستماع السابق
    if (_requestsListenerUnsub) {
      _requestsListenerUnsub();
      _requestsListenerUnsub = null;
    }
    if (_outgoingRequestsListenerUnsub) {
      _outgoingRequestsListenerUnsub();
      _outgoingRequestsListenerUnsub = null;
    }

    if (!user) {
      renderNotLoggedIn();
    } else {
      loadCommunityData();

      // ابدأ الاستماع المباشر للطلبات الواردة
      _requestsListenerUnsub = listenForIncomingRequests(user.uid, (requests) => {
        _incomingRequests = requests;
        if (_activeTab === 'requests') {
          renderRequests();
        }
      });

      // ابدأ الاستماع المباشر للطلبات المرسلة
      _outgoingRequestsListenerUnsub = listenForOutgoingRequests(user.uid, (requests) => {
        _outgoingRequests = requests;
        if (_activeTab === 'all') {
          renderAllPlayers();
        }
      });
    }
  });
}

let _requestsListenerUnsub = null;
let _outgoingRequestsListenerUnsub = null;

function setupCommunityAuthModal() {
  const modal = document.getElementById('community-auth-modal');
  const modalOverlay = document.querySelector('#community-auth-modal .auth-modal-overlay');
  const modalBox = document.querySelector('#community-auth-modal .auth-modal-box');
  const googleBtn = document.getElementById('community-auth-modal-google-btn');

  if (modalOverlay) {
    modalOverlay.onclick = () => {
      modal.hidden = true;
    };
  }

  if (modalBox) {
    modalBox.onclick = (e) => {
      e.stopPropagation();
    };
  }

  if (googleBtn) {
    googleBtn.onclick = async () => {
      await signInWithGoogle();
    };
  }
}

function renderNotLoggedIn() {
  // إخفاء التبويبات والبحث
  const tabs = document.querySelector('.community-tabs');
  const search = document.querySelector('.community-search');
  const contents = document.querySelectorAll('.community-tab-content');

  if (tabs) tabs.style.display = 'none';
  if (search) search.style.display = 'none';
  contents.forEach(c => c.style.display = 'none');

  // عرض رسالة تسجيل الدخول في أول tab
  const container = document.getElementById('community-all-list');
  if (container) {
    container.innerHTML = `
      <div class="community-login-prompt">
        <div class="community-login-emoji">🔐</div>
        <h3>سجل دخول للمتابعة</h3>
        <p>تواصل مع لاعبين آخرين وأضفهم كأصدقاء</p>
        <button class="btn btn-primary" onclick="window._openAuthModal()">دخول بـ Google</button>
      </div>
    `;
    const content = document.querySelector('[data-content="all"]');
    if (content) content.style.display = 'block';
  }
}

async function loadCommunityData() {
  console.log('Loading community data...');

  // إخفاء الـ modal بعد تسجيل الدخول
  const modal = document.getElementById('community-auth-modal');
  if (modal) modal.hidden = true;

  // إظهار التبويبات والبحث
  const tabs = document.querySelector('.community-tabs');
  const search = document.querySelector('.community-search');
  const contents = document.querySelectorAll('.community-tab-content');

  if (tabs) tabs.style.display = 'flex';
  if (search) search.style.display = 'flex';
  contents.forEach(c => c.style.display = 'none');

  // احصل على جميع اللاعبين
  _allPlayers = await getPlayers();
  console.log('Players loaded:', _allPlayers.length);

  // احصل على أصدقاء المستخدم الحالي
  if (_currentUser) {
    _userFriends = await getFriends(_currentUser.uid);
    console.log('Friends loaded:', _userFriends.length);

    // احصل على طلبات الصداقة الواردة
    try {
      _incomingRequests = await getIncomingRequests(_currentUser.uid);
      console.log('Requests loaded:', _incomingRequests.length);
    } catch (e) {
      console.error('Error loading requests:', e.message);
      _incomingRequests = [];
    }

    // احصل على طلبات الصداقة المرسلة
    try {
      _outgoingRequests = await getOutgoingRequests(_currentUser.uid);
      console.log('Outgoing requests loaded:', _outgoingRequests.length);
    } catch (e) {
      console.error('Error loading outgoing requests:', e.message);
      _outgoingRequests = [];
    }
  }

  renderTab('all');
}

function switchTab(tabName) {
  _activeTab = tabName;

  // تحديث الأزرار
  document.querySelectorAll('.community-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // إظهار/إخفاء المحتوى
  document.querySelectorAll('.community-tab-content').forEach(content => {
    content.style.display = content.dataset.content === tabName ? 'block' : 'none';
  });

  renderTab(tabName);
}

function getSearchQuery() {
  const input = document.getElementById('community-search-input');
  return input?.value.toLowerCase() || '';
}

function renderTab(tabName) {
  console.log('Rendering tab:', tabName);
  if (tabName === 'all') {
    renderAllPlayers();
  } else if (tabName === 'friends') {
    renderFriends();
  } else if (tabName === 'requests') {
    renderRequests();
  }
}

function renderAllPlayers() {
  const container = document.getElementById('community-all-list');
  if (!container) return;

  const searchQuery = getSearchQuery();
  const filtered = _allPlayers.filter(p => p.displayName.toLowerCase().includes(searchQuery));

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="community-empty">
        <span class="community-empty-emoji">🔍</span>
        <div>لا توجد نتائج</div>
      </div>
    `;
    return;
  }

  console.log('Rendering', filtered.length, 'players');

  container.innerHTML = filtered.map(player => {
    const isSelf = _currentUser && player.uid === _currentUser.uid;
    const isFriend = _userFriends.some(f => f.uid === player.uid);
    const hasSentRequest = _currentUser && _hasSentRequest(_currentUser.uid, player.uid);

    let buttonHTML = '';
    if (isSelf) {
      buttonHTML = `<button class="community-player-button" disabled>أنت</button>`;
    } else if (isFriend) {
      buttonHTML = `<button class="community-player-button friend" disabled>✓ صديق</button>`;
    } else if (hasSentRequest) {
      buttonHTML = `<button class="community-player-button sent" disabled>⏱ طلب مرسل</button>`;
    } else {
      buttonHTML = `<button class="community-player-button" onclick="window._addFriend('${player.uid}', '${player.displayName}')">أضف</button>`;
    }

    const avatarHtml = player.avatarImage
      ? `<img class="community-player-avatar" src="${player.avatarImage}" alt="Avatar">`
      : `<div class="community-player-avatar">${player.avatar || player.rankEmoji}</div>`;

    return `
      <div class="community-player-card" onclick="window._viewProfile('${player.uid}')">
        ${avatarHtml}
        <div class="community-player-info">
          <div class="community-player-name">${player.displayName}</div>
          <div class="community-player-stats">
            <span>${player.rankLabel}</span>
          </div>
        </div>
        <div onclick="event.stopPropagation()">${buttonHTML}</div>
      </div>
    `;
  }).join('');
}

function renderFriends() {
  const container = document.getElementById('community-friends-list');
  const searchQuery = getSearchQuery();
  const filtered = _userFriends.filter(f => f.displayName.toLowerCase().includes(searchQuery));

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="community-empty">
        <span class="community-empty-emoji">😔</span>
        <div>لا توجد أصدقاء حتى الآن</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(friend => {
    const avatarHtml = friend.avatarImage
      ? `<img class="community-player-avatar" src="${friend.avatarImage}" alt="Avatar">`
      : `<div class="community-player-avatar">${friend.avatar || friend.rankEmoji}</div>`;
    return `
      <div class="community-player-card" onclick="window._viewProfile('${friend.uid}')">
        ${avatarHtml}
        <div class="community-player-info">
          <div class="community-player-name">${friend.displayName}</div>
          <div class="community-player-stats">
            <span>${friend.rankLabel}</span>
          </div>
        </div>
        <button class="community-player-button" onclick="event.stopPropagation(); window._openChat('${friend.uid}', '${friend.displayName}')">💬 شات</button>
      </div>
    `;
  }).join('');
}

function renderRequests() {
  const container = document.getElementById('community-requests-list');

  if (_incomingRequests.length === 0) {
    container.innerHTML = `
      <div class="community-empty">
        <span class="community-empty-emoji">📬</span>
        <div>لا توجد طلبات واردة</div>
      </div>
    `;
    return;
  }

  container.innerHTML = _incomingRequests.map((req, i) => `
    <div class="community-request-card">
      <div class="community-request-info">${req.fromName}</div>
      <div class="community-request-actions">
        <button class="community-request-btn" onclick="window._acceptRequest('${req.id}', '${req.fromUid}', ${i})">قبول</button>
        <button class="community-request-btn reject" onclick="window._rejectRequest('${req.id}', '${req.fromUid}', ${i})">رفض</button>
      </div>
    </div>
  `).join('');
}

// دوال عامة (window scope)
window._addFriend = async function(toUid, toName) {
  if (!_currentUser) return;

  const fromName = _currentUser.displayName || 'لاعب';
  const success = await sendFriendRequest(_currentUser.uid, toUid, fromName);
  if (success) {
    _markRequestSent(_currentUser.uid, toUid);
    _outgoingRequests.push({ toUid, toName });
  } else {
    alert('فشل إرسال طلب الصداقة، الرجاء التأكد من صلاحيات Firestore أو إعادة تحميل الصفحة.');
  }
  renderAllPlayers();
};

window._acceptRequest = async function(reqId, fromUid, index) {
  if (!_currentUser) return;

  await acceptFriendRequest(reqId, fromUid, _currentUser.uid);
  _clearFriendRequest(fromUid, _currentUser.uid);
  _incomingRequests.splice(index, 1);
  await loadCommunityData();
  switchTab('requests');
};

window._rejectRequest = async function(reqId, fromUid, index) {
  if (!_currentUser) return;

  await rejectFriendRequest(reqId);
  _clearFriendRequest(fromUid, _currentUser.uid);
  _incomingRequests.splice(index, 1);
  renderRequests();
};

window._openAuthModal = function() {
  const modal = document.getElementById('community-auth-modal');
  if (modal) modal.hidden = false;
};

// ===== عرض بروفايل لاعب =====
window._viewProfile = async function(uid) {
  if (!_currentUser) return;
  const modal = document.getElementById('player-profile-modal');
  const content = document.getElementById('player-profile-content');
  if (!modal || !content) return;

  content.innerHTML = '<div style="padding:2rem;color:#888">جاري التحميل...</div>';
  modal.hidden = false;

  const profile = await getPlayerProfile(uid);
  if (!profile) {
    content.innerHTML = '<div style="padding:2rem;color:#E74C3C">فشل تحميل البروفايل</div>';
    return;
  }

  const isSelf = uid === _currentUser.uid;
  const isFriend = _userFriends.some(f => f.uid === uid);
  const userProfile = profile.profile || {};

  let actionsHTML = '';
  if (!isSelf && isFriend) {
    actionsHTML = `
      <div class="player-profile-actions">
        <button class="btn btn-primary" onclick="window._openChat('${uid}', '${profile.displayName}')">💬 محادثة</button>
      </div>
    `;
  } else if (!isSelf && !isFriend) {
    const hasSent = _hasSentRequest(_currentUser.uid, uid);
    if (hasSent) {
      actionsHTML = `<div class="player-profile-actions"><button class="btn" disabled>⏱ طلب مرسل</button></div>`;
    } else {
      actionsHTML = `<div class="player-profile-actions"><button class="btn btn-primary" onclick="window._addFriend('${uid}', '${profile.displayName}')">إضافة صديق</button></div>`;
    }
  }

  const avatarHtml = profile.avatarImage
    ? `<div class="player-profile-avatar"><img src="${profile.avatarImage}" alt="Avatar"></div>`
    : `<div class="player-profile-avatar player-profile-avatar-emoji">${profile.avatar}</div>`;

  content.innerHTML = `
    ${avatarHtml}
    <div class="player-profile-emoji">${profile.rankEmoji}</div>
    <div class="player-profile-name">${profile.displayName}</div>
    <div class="player-profile-rank">${profile.rankEmoji} ${profile.rankLabel}</div>

    <div class="player-profile-stats">
      <div class="player-profile-stat">
        <div class="player-profile-stat-value">${profile.totalLetters || 0}</div>
        <div class="player-profile-stat-label">حرف مجموع</div>
      </div>
      <div class="player-profile-stat">
        <div class="player-profile-stat-value">${profile.friends?.length || 0}</div>
        <div class="player-profile-stat-label">أصدقاء</div>
      </div>
    </div>

    ${userProfile.bio ? `<div class="player-profile-bio">"${userProfile.bio}"</div>` : ''}
    ${userProfile.city ? `<div style="color:#888;font-size:0.85rem">📍 ${userProfile.city}</div>` : ''}
    ${userProfile.age ? `<div style="color:#888;font-size:0.85rem">🎂 العمر: ${userProfile.age}</div>` : ''}
    ${userProfile.hobbies ? `<div style="color:#888;font-size:0.85rem">⭐ الهوايات: ${userProfile.hobbies}</div>` : ''}

    ${actionsHTML}
  `;
};

// ===== فتح الشات =====
window._openChat = function(uid, name) {
  if (!_currentUser) return;

  const profileModal = document.getElementById('player-profile-modal');
  const chatModal = document.getElementById('chat-modal');
  const sidebar = document.getElementById('community-chat-panel');
  const emptyPanel = document.getElementById('community-chat-empty');
  const chatNameEl = document.getElementById('sidebar-chat-name');
  const statusEl = document.getElementById('sidebar-chat-status');
  const avatarEl = document.getElementById('sidebar-chat-avatar');
  const messagesEl = document.getElementById('sidebar-chat-messages');

  if (profileModal) profileModal.hidden = true;
  if (chatModal) chatModal.hidden = true;
  _chatPartnerUid = uid;
  _chatPartnerName = name;

  if (chatNameEl) chatNameEl.textContent = name;
  if (statusEl) statusEl.textContent = 'جاري تحميل المحادثة...';
  if (avatarEl) avatarEl.textContent = name.charAt(0) || '💬';

  if (sidebar) {
    sidebar.classList.remove('hidden');
    sidebar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const inputEl = document.getElementById('sidebar-chat-input');
    inputEl?.focus();
  }
  if (emptyPanel) emptyPanel.classList.add('hidden');
  if (messagesEl) messagesEl.innerHTML = '<div style="text-align:center;color:#888;padding:1rem">جاري التحميل...</div>';

  if (_chatListenerUnsub) _chatListenerUnsub();
  _chatListenerUnsub = listenForMessages(_currentUser.uid, uid, (messages) => {
    if (!messagesEl) return;
    if (messages.length === 0) {
      messagesEl.innerHTML = '<div style="text-align:center;color:#888;padding:1rem">لا توجد رسائل بعد. ابدأ المحادثة!</div>';
      if (statusEl) statusEl.textContent = 'جاهز للدردشة';
      return;
    }
    messagesEl.innerHTML = messages.map(msg => {
      const isSent = msg.from === _currentUser.uid;
      const time = msg.createdAt.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="chat-message ${isSent ? 'sent' : 'received'}">
          <span>${escapeHTML(msg.text)}</span>
          <span class="chat-message-time">${time}</span>
        </div>
      `;
    }).join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if (statusEl) statusEl.textContent = 'متصل الآن';
  });
};

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// إعداد الـ chat modal والبروفايل
document.addEventListener('DOMContentLoaded', () => {
  const profileCloseBtn = document.getElementById('player-profile-close-btn');
  const profileModal = document.getElementById('player-profile-modal');
  const profileOverlay = profileModal?.querySelector('.auth-modal-overlay');

  if (profileCloseBtn) {
    profileCloseBtn.onclick = () => { if (profileModal) profileModal.hidden = true; };
  }
  if (profileOverlay) {
    profileOverlay.onclick = () => { if (profileModal) profileModal.hidden = true; };
  }

  const chatBackBtn = document.getElementById('chat-back-btn');
  const chatModal = document.getElementById('chat-modal');
  const chatOverlay = chatModal?.querySelector('.auth-modal-overlay');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');

  if (chatBackBtn) {
    chatBackBtn.onclick = () => {
      if (chatModal) chatModal.hidden = true;
      if (_chatListenerUnsub) { _chatListenerUnsub(); _chatListenerUnsub = null; }
    };
  }
  if (chatOverlay) {
    chatOverlay.onclick = () => {
      if (chatModal) chatModal.hidden = true;
      if (_chatListenerUnsub) { _chatListenerUnsub(); _chatListenerUnsub = null; }
    };
  }

  if (chatForm) {
    chatForm.onsubmit = async (e) => {
      e.preventDefault();
      if (!_currentUser || !_chatPartnerUid || !chatInput.value.trim()) return;
      const text = chatInput.value;
      chatInput.value = '';
      const fromName = _currentUser.displayName || 'لاعب';
      await sendChatMessage(_currentUser.uid, _chatPartnerUid, fromName, text);
    };
  }

  const sidebarClose = document.getElementById('sidebar-chat-close');
  const sidebarPanel = document.getElementById('community-chat-panel');
  const sidebarEmpty = document.getElementById('community-chat-empty');
  const sidebarForm = document.getElementById('sidebar-chat-form');
  const sidebarInput = document.getElementById('sidebar-chat-input');

  if (sidebarClose) {
    sidebarClose.onclick = () => {
      if (sidebarPanel) sidebarPanel.classList.add('hidden');
      if (sidebarEmpty) sidebarEmpty.classList.remove('hidden');
      if (_chatListenerUnsub) { _chatListenerUnsub(); _chatListenerUnsub = null; }
    };
  }

  if (sidebarForm) {
    sidebarForm.onsubmit = async (e) => {
      e.preventDefault();
      if (!_currentUser || !_chatPartnerUid || !sidebarInput?.value.trim()) return;
      const text = sidebarInput.value;
      sidebarInput.value = '';
      const fromName = _currentUser.displayName || 'لاعب';
      await sendChatMessage(_currentUser.uid, _chatPartnerUid, fromName, text);
    };
  }
});
