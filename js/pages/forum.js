// ===== صفحة المنتدى =====
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { signInWithGoogle, createForumPost, deleteForumPost, listenForForumPosts, listenForForumComments,
         listenForForumLikes, addForumComment, likeForumPost, unlikeForumPost, getPlayerProfile,
         getPlayers } from '../core/firebase.js';
import { canAffordText, spendForText } from '../core/storage.js';
import { incrementCounter } from '../core/achievements.js';
import { getProfile } from '../core/profile-storage.js';
import { renderAvatarHtml } from '../core/avatar-helper.js';
import { applyTextFilter, BAD_WORDS_PENALTY } from '../core/text-filter.js';
import { showGameNotification } from '../core/notifications.js';

// 10 أقسام عامة
export const FORUM_CATEGORIES = [
  { id: 'all',         label: '🏠 الرئيسية',  emoji: '🏠' },
  { id: 'general',     label: '📂 عام',        emoji: '📂' },
  { id: 'questions',   label: '❓ أسئلة',     emoji: '❓' },
  { id: 'suggestions', label: '💡 اقتراحات',  emoji: '💡' },
  { id: 'lifestyle',   label: '🌿 حياة',       emoji: '🌿' },
  { id: 'tech',        label: '💻 تقنية',      emoji: '💻' },
  { id: 'culture',     label: '📚 ثقافة',      emoji: '📚' },
  { id: 'sports',      label: '⚽ رياضة',      emoji: '⚽' },
  { id: 'free',        label: '💬 نقاش حر',    emoji: '💬' },
  { id: 'news',        label: '📰 أخبار',      emoji: '📰' },
];

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
let _activeCategory = 'all';

// كاش أسماء اللاعبين الحالية (uid → currentDisplayName) — يُحدث من leaderboard
const _nameCache = {};
let _nameCacheLoaded = false;

async function _loadNameCache() {
  if (_nameCacheLoaded) return;
  try {
    const players = await getPlayers();
    for (const p of players) {
      _nameCache[p.uid] = {
        name: p.displayName,
        avatar: p.avatar,
        avatarImage: p.avatarImage,
        rankEmoji: p.rankEmoji,
        rankTitle: p.rankTitle,
        rankColor: p.rankColor,
        equippedFrame: p.equippedFrame,
      };
    }
    _nameCacheLoaded = true;
  } catch {}
}

// يرجع أحدث اسم لمستخدم (من cache leaderboard)، fallback لـauthorName المخزن
function _resolveAuthor(authorUid, fallbackName) {
  const cached = _nameCache[authorUid];
  return cached?.name || fallbackName || 'لاعب';
}

export function initForum(navigate) {
  if (_initialized) return;
  _initialized = true;

  const auth = getAuth();
  const forumForm = document.getElementById('forum-post-form');
  const loginBtn = document.getElementById('forum-login-btn');

  // املأ dropdown الأقسام للنشر (بدون "الرئيسية")
  const sel = document.getElementById('forum-post-category');
  if (sel) {
    sel.innerHTML = FORUM_CATEGORIES
      .filter(c => c.id !== 'all')
      .map(c => `<option value="${c.id}">${c.label}</option>`)
      .join('');
    sel.value = 'general';
  }

  // اعرض شريط الأقسام للفلترة
  _renderCategories();

  if (forumForm) {
    forumForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!_currentUser) return;
      const textarea = document.getElementById('forum-post-input');
      const select   = document.getElementById('forum-post-category');
      if (!textarea) return;
      const content = textarea.value.trim();
      if (!content) return;
      const category = select?.value || 'general';

      // فلتر الكلمات الممنوعة
      const filter = applyTextFilter(content);
      if (filter.blocked) {
        const penaltyMsg = filter.penaltyApplied
          ? `\nخُصم ${filter.penaltyAmount} حرف من مخزنك كعقوبة.`
          : '';
        showGameNotification(`🚫 تم رفض المنشور — يحتوي على كلمة ممنوعة.${penaltyMsg}`, 'error');
        return;
      }

      const check = canAffordText(content);
      if (!check.ok) {
        showGameNotification(`ما عندك حرف "${check.missing}" كافي بالمخزن. بدك ${check.need} ومعك ${check.have}.`, 'warning');
        return;
      }
      const result = await createForumPost(_currentUser.uid, _displayName(), content, category);
      if (result?.success) {
        spendForText(content);
        incrementCounter('forum_posts_created');
        textarea.value = '';
        renderForumPosts();
      } else {
        console.error('Forum post error:', result?.error);
        showGameNotification(`تعذَّر إنشاء الموضوع: ${result?.error || ''}`, 'error');
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

  // حمّل cache الأسماء (من leaderboard) ثم استمع للمنشورات
  _loadNameCache().then(() => {
    listenForForumPosts((posts) => {
      _posts = posts;
      _subscribeForumMeta(posts);
      renderForumPosts();
    });
  });
}

function _renderCategories() {
  const container = document.getElementById('forum-categories');
  if (!container) return;
  container.innerHTML = FORUM_CATEGORIES.map(c => `
    <button class="forum-cat-tab ${c.id === _activeCategory ? 'active' : ''}" data-cat="${c.id}">
      ${c.label}
    </button>
  `).join('');
  container.querySelectorAll('.forum-cat-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeCategory = btn.dataset.cat;
      _renderCategories();
      renderForumPosts();
    });
  });
}

function updateForumAuthState() {
  const loginPrompt = document.getElementById('forum-login-prompt');
  const createPanel = document.getElementById('forum-create-panel');

  if (_currentUser) {
    if (loginPrompt) loginPrompt.hidden = true;
    if (createPanel) createPanel.hidden = false;
  } else {
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

  // فلترة حسب القسم النشط
  const filtered = _activeCategory === 'all'
    ? _posts
    : _posts.filter(p => (p.category || 'general') === _activeCategory);

  if (filtered.length === 0) {
    const catLabel = FORUM_CATEGORIES.find(c => c.id === _activeCategory)?.label || '';
    container.innerHTML = `
      <div class="forum-empty">
        <div class="forum-empty-emoji">📝</div>
        <div>لا توجد منشورات في ${catLabel}. كن أول من يشارك!</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(post => {
    const comments = _postComments[post.id] || [];
    const likes = _postLikes[post.id] || [];
    const liked = _currentUser ? likes.includes(_currentUser.uid) : false;
    const canComment = Boolean(_currentUser);
    const dateLabel = post.createdAt.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short', year: 'numeric' });

    // اسم المؤلف الحالي من cache leaderboard
    const cached = _nameCache[post.authorUid];
    const displayName = _resolveAuthor(post.authorUid, post.authorName);
    const titleColor = cached?.rankColor || '#FFD700';
    const rankEmoji = cached?.rankEmoji || '';

    const catObj = FORUM_CATEGORIES.find(c => c.id === (post.category || 'general'));
    const catBadge = catObj && catObj.id !== 'general'
      ? `<span class="forum-post-cat-badge">${catObj.label}</span>`
      : '';

    const commentHtml = comments.length > 0 ? comments.map(comment => {
      const cName = _resolveAuthor(comment.authorUid, comment.authorName);
      return `
        <div class="forum-comment">
          <div class="forum-comment-author forum-clickable" onclick="window._viewForumProfile('${comment.authorUid}')">${escapeHTML(cName)}</div>
          <div class="forum-comment-text">${escapeHTML(comment.content)}</div>
        </div>
      `;
    }).join('') : `<div class="forum-comment-empty">لا توجد تعليقات بعد.</div>`;

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

    // أفاتار صاحب المنشور: من cache leaderboard (صورة + إطار)
    const authorAvatarHtml = renderAvatarHtml({
      avatarImage: cached?.avatarImage,
      avatarEmoji: cached?.avatar || (displayName.charAt(0) || '؟'),
      frameId: cached?.equippedFrame,
      wrapperClass: 'forum-post-avatar',
    });

    return `
      <div class="forum-post-card">
        <div class="forum-post-header">
          <div class="forum-post-author-block forum-clickable" onclick="window._viewForumProfile('${post.authorUid}')">
            ${authorAvatarHtml}
            <div>
              <div class="forum-post-author" style="color:${titleColor}">${rankEmoji} ${escapeHTML(displayName)}</div>
              <div class="forum-post-meta">${dateLabel} ${catBadge}</div>
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
    showGameNotification('سجل دخول لتتمكن من الإعجاب.', 'info');
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
  const { showGameConfirm } = await import('../core/dialogs.js');
  if (!(await showGameConfirm('هل أنت متأكد أنك تريد حذف هذا المنشور؟'))) return;
  const result = await deleteForumPost(postId, _currentUser.uid);
  if (!result?.success) {
    console.error('Delete forum post failed:', result?.error);
    showGameNotification(`فشل حذف المنشور: ${result?.error || ''}`, 'error');
  }
};

window._viewForumProfile = async function(uid) {
  if (!uid) return;

  // فحص اللفل: لازم لفل 2+ لفتح بروفايل غيرك
  const me = getAuth().currentUser;
  if (me && uid !== me.uid) {
    try {
      const { getLevel, getLifetimeTotal } = await import('../core/lifetime-storage.js');
      const myLevel = getLevel(getLifetimeTotal());
      if (myLevel < 2) {
        showGameNotification(`🔒 يجب أن تكون لفل 2 على الأقل لفتح بروفايلات اللاعبين.\nأنت حالياً لفل ${myLevel}.`, 'warning');
        return;
      }
    } catch {}
  }

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
  const titleColor = profile.rankColor || '#FFD700';
  const prestigeBadge = profile.isPrestige
    ? `<span class="player-profile-prestige">⭐ بريستيج</span>` : '';

  const avatarHtml = renderAvatarHtml({
    avatarImage: profile.avatarImage,
    avatarEmoji: profile.avatar,
    frameId: profile.equippedFrame,
    wrapperClass: 'player-profile-avatar',
  });

  content.innerHTML = `
    ${avatarHtml}
    <div class="player-profile-name">${escapeHTML(profile.displayName || 'لاعب')}</div>
    <div class="player-profile-title" style="color: ${titleColor}">
      ${profile.rankEmoji || '🌱'} ${escapeHTML(profile.rankTitle || '')}
      ${prestigeBadge}
    </div>
    <div class="player-profile-rank">${escapeHTML(profile.rankLabel || '')}</div>

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
    showGameNotification('سجل دخول لتتمكن من التعليق.', 'info');
    return;
  }
  const input = document.getElementById(`forum-comment-input-${postId}`);
  if (!input) return;
  const content = input.value.trim();
  if (!content) return;

  // فلتر الكلمات الممنوعة
  const filter = applyTextFilter(content);
  if (filter.blocked) {
    const penaltyMsg = filter.penaltyApplied
      ? `\nخُصم ${filter.penaltyAmount} حرف من مخزنك كعقوبة.`
      : '';
    showGameNotification(`🚫 تم رفض التعليق — يحتوي على كلمة ممنوعة.${penaltyMsg}`, 'error');
    return;
  }

  const check = canAffordText(content);
  if (!check.ok) {
    showGameNotification(`ما عندك حرف "${check.missing}" كافي بالمخزن. بدك ${check.need} ومعك ${check.have}.`, 'warning');
    return;
  }
  await addForumComment(postId, _currentUser.uid, _displayName(), content);
  spendForText(content);
  incrementCounter('forum_comments_created');
  input.value = '';
};

// إعداد إغلاق modal البروفايل
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
