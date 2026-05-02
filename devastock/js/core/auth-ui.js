// ===== واجهة تسجيل الدخول/الخروج =====
import { signInWithGoogle, signOutUser } from './firebase.js';

let _currentUser = null;

export function renderAuthButton(user) {
  const btn = document.getElementById('auth-btn');
  const dropdown = document.getElementById('auth-dropdown');
  if (!btn || !dropdown) return;

  _currentUser = user;
  console.log('Auth state changed:', user ? `Logged in as ${user.displayName}` : 'Logged out');

  if (user) {
    // مسجل دخول
    const name = user.displayName?.split(' ')[0] ?? 'لاعب';
    const photo = user.photoURL;
    btn.innerHTML = photo
      ? `<img class="auth-avatar" src="${photo}" alt="${name}"><span class="auth-name">${name}</span>`
      : `<span class="auth-emoji">👤</span><span class="auth-name">${name}</span>`;
    btn.classList.add('logged-in');
    btn.title = 'اضغط لفتح القائمة';

    // إغلاق الـ dropdown
    dropdown.hidden = true;

    // تحديث معلومات الـ dropdown
    const userNameEl = dropdown.querySelector('.auth-user-name');
    if (userNameEl) userNameEl.textContent = user.displayName ?? 'لاعب';

    btn.onclick = (e) => {
      e.stopPropagation();
      dropdown.hidden = !dropdown.hidden;
    };
  } else {
    // لم يسجل دخول
    btn.innerHTML = '<span class="auth-icon">🔑</span><span>دخول</span>';
    btn.classList.remove('logged-in');
    btn.title = 'فتح نافذة تسجيل الدخول';
    dropdown.hidden = true;

    btn.onclick = (e) => {
      e.stopPropagation();
      // لا تفعل شيء — الـ modal يفتح من المجتمع فقط
    };
  }
}

// إغلاق الـ dropdown عند الضغط خارجه
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('auth-dropdown');
  const btn = document.getElementById('auth-btn');
  if (dropdown && !dropdown.hidden && e.target !== btn && !btn.contains(e.target)) {
    dropdown.hidden = true;
  }
});

// إعداد معالجات الـ dropdown
function setupAuthHandlers() {
  const logoutBtn = document.getElementById('auth-logout-btn');

  if (logoutBtn) {
    logoutBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm('هل تريد تسجيل الخروج؟')) {
        signOutUser();
      }
    };
  }
}

// استدعاء عند تحميل الصفحة
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupAuthHandlers);
} else {
  setupAuthHandlers();
}
