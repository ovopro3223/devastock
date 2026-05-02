// ===== صفحة المنتدى =====
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { signInWithGoogle, createForumPost, listenForForumPosts, listenForForumComments,
         listenForForumLikes, addForumComment, likeForumPost, unlikeForumPost } from '../core/firebase.js';

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
      const createdId = await createForumPost(_currentUser.uid, _currentUser.displayName || 'لاعب', content);
      if (createdId) {
        textarea.value = '';
        renderForumPosts();
      } else {
        alert('تعذَّر إنشاء الموضوع، حاول مرة أخرى.');
      }
    });
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      await signInWithGoogle();
    });
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
    if (userLabel) userLabel.textContent = _currentUser.displayName || 'لاعب';
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
        <div class="forum-comment-author">${escapeHTML(comment.authorName)}</div>
        <div class="forum-comment-text">${escapeHTML(comment.content)}</div>
      </div>
    `).join('') : `<div class="forum-comment-empty">لا توجد تعليقات بعد.</div>`;

    return `
      <div class="forum-post-card">
        <div class="forum-post-header">
          <div>
            <div class="forum-post-author">${escapeHTML(post.authorName)}</div>
            <div class="forum-post-meta">${dateLabel}</div>
          </div>
          <button class="forum-like-btn ${liked ? 'liked' : ''}" onclick="window._toggleForumLike('${post.id}')">
            ❤️ ${likes.length}
          </button>
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
  await addForumComment(postId, _currentUser.uid, _currentUser.displayName || 'لاعب', content);
  input.value = '';
};

function escapeHTML(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}
