// ===== صفحة المنتدى =====
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { signInWithGoogle, createForumPost, deleteForumPost, listenForForumPosts, listenForForumComments,
         listenForForumLikes, addForumComment, likeForumPost, unlikeForumPost, getPlayerProfile } from '../core/firebase.js';
import { canAffordText, spendForText } from '../core/storage.js';
import { incrementCounter } from '../core/achievements.js';
import { getProfile } from '../core/profile-storage.js';

function _displayName() {
  const p = getProfile();
  if (p && p.name && p.name.trim()) return p.name.trim();
  const auth = getAuth();
  return auth.currentUser?.displayName || 'لاعب';
}

let _currentUser = null;
let _posts = [];
let _postComments = {};
let _postLikes = {};
let _forumMetaUnsub = [];
let _initialized = false;

export function initForum(navigate) {
  if (_initialized) return;
  _initialized = true;

  const auth = getAuth();
  const forumForm = document.getElementById('forum-post-form');
  const loginBtn = document.getElementById('forum-login-btn');

  if (forumForm) {
    forumForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!_currentUser) return;
      const textarea = document.getElementById('forum-post-input');
      if (!textarea) return;
      const content = textarea.value.trim();
      if (!content) return;
      const check = canAffordText(content);
      if (!check.ok) {
        alert(`ما عندك حرف "${check.missing}" كافي بالمخزن.\nبدك ${check.need} ومعك ${check.have}.`);
        return;
      }
      const result = await createForumPost(_currentUser.uid, _displayName(), content);
      if (result?.success) {
        spendForText(content);
        incrementCounter('forum_posts_created');
        textarea.value = '';
        renderForumPosts();
      } else {
        console.error('Forum post error:', result?.error);
        alert(`تعذَّر إنشاء الموضوع، حاول مرة أخرى.\n${result?.error || ''}`);
      }
    });
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', () => signInWithGoogle());
  }

  onAuthStateChanged(auth, (user) => {
    _currentUser = user;
    updateForumAuthState();
  });

  listenForForumPosts((posts) => {
    _posts = posts;
    _subscribeForumMeta(posts);
    renderForumPosts();
  });
}

function updateForumAuthState() {
  const userLabel = document.getElementById('forum-user-label');
  const loginPrompt = document.getElementById('forum-login-prompt');
  const createPanel = document.getElementById('forum-create-panel');

  if (_currentUser) {
    if (userLabel) userLabel.textContent = _displayName();
    if (loginPrompt) loginPrompt.hidden = true;
    if (createPanel) createPanel.hidden = false;
  } else {
    if (userLabel) userLabel.textContent = 'ضيف';
    if (loginPrompt) loginPrompt.hidden = false;
    if (createPanel) createPanel.hidden = true;
  }
  renderForumPosts();
}

function _subscribeForumMeta(posts) {
  _forumMetaUnsub.forEach(fn => fn && fn());
  _forumMetaUnsub = [];
  _postComments = {};
  _postLikes = {};

  for (const post of posts) {
    const unloadComments = listenForForumComments(post.id, (comments) => {
      _postComments[post.id] = comments;
      renderForumPosts();
    });
    const unloadLikes = listenForForumLikes(post.id, (likes) => {
      _postLikes[post.id] = likes;
      renderForumPosts();
    });
    _forumMetaUnsub.push(unloadComments, unloadLikes);
  }
}

function renderForumPosts() {
  const container = document.getElementById('forum-posts-list');
  if (!container) return;

  if (_posts.length === 0) {
    container.innerHTML = `
      <div class="forum-empty">
        <div class="forum-empty-emoji">📝</div>
        <div>لا توجد منشورات بعد. كن أول من يشارك!</div>
      </div>
    `;
    return;
  }

  container.innerHTML = _posts.map(post => {
    const comments = _postComments[post.id] || [];
    const likes = _postLikes[post.id] || [];
    const liked = _currentUser ? likes.includes(_currentUser.uid) : false;
    const canComment = Boolean(_currentUser);
    const dateLabel = post.createdAt.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short', year: 'numeric' });

    const commentHtml = comments.length > 0 ? comments.map(comment => `
      <div class="forum-comment">
        <div class="forum-comment-author forum-clickable" onclick="window._viewForumProfile('${comment.authorUid}')">${escapeHTML(comment.authorName)}</div>
        <div class="forum-comment-text">${escapeHTML(comment.content)}</div>
      </div>
    `).join('') : `<div class="forum-comment-empty">لا توجد تعليقات بعد.</div>`;

    const isAuthor = _currentUser && post.authorUid === _currentUser.uid;
    const actionsHtml = `
      <div class="forum-post-actions">
        <button class="forum-action-btn like-btn ${liked ? 'liked' : ''}" onclick="window._toggleForumLike('${post.id}')">
          ❤️ ${likes.length}
        </button>
        <button class="forum-action-btn comment-btn" onclick="document.getElementById('forum-comment-input-${post.id}').focus()">
          💬 تعليق
        </button>
        ${isAuthor ? `<button class="forum-action-btn delete-btn" onclick="window._deleteForumPost('${post.id}')">🗑 حذف</button>` : ''}
      </div>
    `;

    return `
      <div class="forum-post-card">
        <div class="forum-post-header">
          <div class="forum-post-author-block forum-clickable" onclick="window._viewForumProfile('${post.authorUid}')">
            <div class="forum-post-avatar">${escapeHTML(post.authorName.charAt(0) || '؟')}</div>
            <div>
              <div class="forum-post-author">${escapeHTML(post.authorName)}</div>
              <div class="forum-post-meta">${dateLabel}</div>
            </div>
          </div>
          ${actionsHtml}
        </div>
        <div class="forum-post-content">${escapeHTML(post.content)}</div>
        <div class="forum-post-footer">
          <span>${comments.length} تعليق</span>
        </div>
        <div class="forum-comments-section">
          ${commentHtml}
        </div>
        <form class="forum-comment-form" onsubmit="window._submitForumComment(event, '${post.id}')">
          <input type="text" id="forum-comment-input-${post.id}" placeholder="اكتب تعليقاً..." ${canComment ? '' : 'disabled'}>
          <button type="submit" class="btn btn-primary" ${canComment ? '' : 'disabled'}>إرسال</button>
        </form>
      </div>
    `;
  }).join('');
}

window._toggleForumLike = async function(postId) {
  if (!_currentUser) {
    alert('سجل دخول لتتمكن من الإعجاب.');
    return;
  }
  const likes = _postLikes[postId] || [];
  if (likes.includes(_currentUser.uid)) {
    await unlikeForumPost(postId, _currentUser.uid);
  } else {
    await likeForumPost(postId, _currentUser.uid);
  }
};

window._deleteForumPost = async function(postId) {
  if (!_currentUser) return;
  const confirmed = confirm('هل أنت متأكد أنك تريد حذف هذا المنشور؟');
  if (!confirmed) return;
  const result = await deleteForumPost(postId, _currentUser.uid);
  if (!result?.success) {
    console.error('Delete forum post failed:', result?.error);
    alert(`فشل حذف المنشور.\n${result?.error || ''}`);
  }
};

window._viewForumProfile = async function(uid) {
  if (!uid) return;
  const modal = document.getElementById('player-profile-modal');
  const content = document.getElementById('player-profile-content');
  if (!modal || !content) return;

  content.innerHTML = '<div style="padding:2rem;color:#888;text-align:center">جاري التحميل...</div>';
  modal.hidden = false;

  const profile = await getPlayerProfile(uid);
  if (!profile) {
    content.innerHTML = '<div style="padding:2rem;color:#E74C3C;text-align:center">فشل تحميل البروفايل</div>';
    return;
  }

  const userProfile = profile.profile || {};
  const avatarHtml = profile.avatarImage
    ? `<div class="player-profile-avatar"><img src="${profile.avatarImage}" alt="Avatar"></div>`
    : `<div class="player-profile-avatar player-profile-avatar-emoji">${profile.avatar || '👤'}</div>`;

  content.innerHTML = `
    ${avatarHtml}
    <div class="player-profile-emoji">${profile.rankEmoji || '🌱'}</div>
    <div class="player-profile-name">${escapeHTML(profile.displayName || 'لاعب')}</div>
    <div class="player-profile-rank">${profile.rankEmoji || '🌱'} ${escapeHTML(profile.rankLabel || '')}</div>

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

    ${userProfile.bio ? `<div class="player-profile-bio">"${escapeHTML(userProfile.bio)}"</div>` : ''}
    ${userProfile.city ? `<div style="color:#888;font-size:0.85rem">📍 ${escapeHTML(userProfile.city)}</div>` : ''}
    ${userProfile.age ? `<div style="color:#888;font-size:0.85rem">🎂 العمر: ${escapeHTML(String(userProfile.age))}</div>` : ''}
    ${userProfile.hobbies ? `<div style="color:#888;font-size:0.85rem">⭐ الهوايات: ${escapeHTML(userProfile.hobbies)}</div>` : ''}
  `;
};

window._submitForumComment = async function(event, postId) {
  event.preventDefault();
  if (!_currentUser) {
    alert('سجل دخول لتتمكن من التعليق.');
    return;
  }
  const input = document.getElementById(`forum-comment-input-${postId}`);
  if (!input) return;
  const content = input.value.trim();
  if (!content) return;
  const check = canAffordText(content);
  if (!check.ok) {
    alert(`ما عندك حرف "${check.missing}" كافي بالمخزن.\nبدك ${check.need} ومعك ${check.have}.`);
    return;
  }
  await addForumComment(postId, _currentUser.uid, _displayName(), content);
  spendForText(content);
  incrementCounter('forum_comments_created');
  input.value = '';
};

// إعداد إغلاق modal البروفايل (يعمل من أي صفحة)
function _setupProfileModalClose() {
  const modal = document.getElementById('player-profile-modal');
  if (!modal) return;
  const closeBtn = document.getElementById('player-profile-close-btn');
  const overlay = modal.querySelector('.auth-modal-overlay');
  if (closeBtn && !closeBtn._bound) {
    closeBtn.onclick = () => { modal.hidden = true; };
    closeBtn._bound = true;
  }
  if (overlay && !overlay._bound) {
    overlay.onclick = () => { modal.hidden = true; };
    overlay._bound = true;
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _setupProfileModalClose);
} else {
  _setupProfileModalClose();
}

function escapeHTML(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}
