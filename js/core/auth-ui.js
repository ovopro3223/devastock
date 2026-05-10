// ===== واجهة تسجيل الدخول/الخروج =====
import { signInWithGoogle, signOutUser } from './firebase.js';
import { renderAvatarHtml } from './avatar-helper.js';

let _currentUser = null;

export function renderAuthButton(user) {
  const btn = document.getElementById('auth-btn');
  const dropdown = document.getElementById('auth-dropdown');
  if (!btn || !dropdown) return;

  _currentUser = user;

  if (user) {
    // الاسم من البروفايل (مش من Google)
    let name = 'لاعب';
    let fullName = user.displayName || 'لاعب';
    try {
      const profileRaw = localStorage.getItem('devastock_profile');
      if (profileRaw) {
        const p = JSON.parse(profileRaw);
        if (p && p.name) {
          fullName = p.name;
          name = p.name.split(' ')[0];
        } else if (user.displayName) {
          name = user.displayName.split(' ')[0];
        }
      } else if (user.displayName) {
        name = user.displayName.split(' ')[0];
      }
    } catch {
      if (user.displayName) name = user.displayName.split(' ')[0];
    }

    const photo = user.photoURL;
    const avatarHtml = renderAvatarHtml({
      avatarImage: photo,
      avatarEmoji: '👤',
      isSelf: true,
      wrapperClass: 'auth-avatar-wrap',
    });
    btn.innerHTML = `${avatarHtml}<span class="auth-name">${name}</span>`;
    btn.classList.add('logged-in');
    btn.title = 'اضغط لفتح القائمة';

    dropdown.hidden = true;

    const userNameEl = dropdown.querySelector('.auth-user-name');
    if (userNameEl) userNameEl.textContent = fullName;

    btn.onclick = (e) => {
      e.stopPropagation();
      dropdown.hidden = !dropdown.hidden;
    };
  } else {
    // لم يسجل دخول — اضغط = افتح نافذة Google مباشرة (يعمل في كل الصفحات)
    btn.innerHTML = '<span class="auth-icon">🔑</span><span>دخول</span>';
    btn.classList.remove('logged-in');
    btn.title = 'تسجيل الدخول بـ Google';
    dropdown.hidden = true;

    btn.onclick = async (e) => {
      e.stopPropagation();
      try {
        await signInWithGoogle();
      } catch (err) {
        console.error('Sign-in error:', err);
      }
    };
  }
}

// إغلاق الـ dropdown عند الضغط خارجه
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('auth-dropdown');
  const btn = document.getElementById('auth-btn');
  if (dropdown && !dropdown.hidden && btn && e.target !== btn && !btn.contains(e.target)) {
    dropdown.hidden = true;
  }
});

// إعداد معالجات الـ dropdown
function setupAuthHandlers() {
  const logoutBtn = document.getElementById('auth-logout-btn');
  const myProfileBtn = document.getElementById('auth-my-profile-btn');

  if (logoutBtn) {
    logoutBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm('هل تريد تسجيل الخروج؟')) {
        signOutUser();
      }
    };
  }

  if (myProfileBtn) {
    myProfileBtn.onclick = (e) => {
      e.stopPropagation();
      const dropdown = document.getElementById('auth-dropdown');
      if (dropdown) dropdown.hidden = true;
      // افتح بروفايلي عبر window._viewProfile
      if (_currentUser && window._viewProfile) {
        window._viewProfile(_currentUser.uid);
      }
    };
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupAuthHandlers);
} else {
  setupAuthHandlers();
}
