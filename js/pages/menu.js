// ===== منطق صفحة القائمة الرئيسية =====
import { renderStock }      from './stock.js';
import { renderMuseumMain } from './museum.js';
import { renderProfile }    from './profile.js';
import { initCommunity }    from './community.js';
import { listenForIncomingRequests, signInWithGoogle, signOutUser } from '../core/firebase.js';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

let _requestsUnsubscribe = null;

export function initMenu(navigate) {
  document.getElementById('btn-modes')
    .addEventListener('click', () => navigate('modes'));

  document.getElementById('btn-stock-menu')
    .addEventListener('click', () => {
      renderStock();
      navigate('stock');
    });

  document.getElementById('btn-museum-menu')
    .addEventListener('click', () => {
      renderMuseumMain();
      navigate('museum');
    });

  document.getElementById('btn-profile-menu')
    .addEventListener('click', () => {
      renderProfile();
      navigate('profile');
    });

  // زر المجتمع (جديد)
  const communityBtn = document.createElement('button');
  communityBtn.id = 'btn-community-menu';
  communityBtn.className = 'btn btn-menu';
  communityBtn.innerHTML = '👥 المجتمع <span id="community-badge" class="notification-badge" hidden>0</span>';
  communityBtn.addEventListener('click', () => {
    initCommunity(navigate);
    navigate('community');
  });

  const menuNav = document.querySelector('.menu-nav');
  menuNav.insertBefore(communityBtn, document.getElementById('btn-settings'));

  // ===== زر تسجيل الدخول / الخروج في القائمة =====
  const menuAuthBtn = document.getElementById('btn-menu-auth');
  if (menuAuthBtn) {
    menuAuthBtn.addEventListener('click', async () => {
      const auth = getAuth();
      if (auth.currentUser) {
        if (confirm('هل تريد تسجيل الخروج؟')) {
          await signOutUser();
        }
      } else {
        await signInWithGoogle();
      }
    });
  }

  // مراقبة طلبات الصداقة في الوقت الفعلي
  const auth = getAuth();
  onAuthStateChanged(auth, (user) => {
    // أوقف الاستماع السابق
    if (_requestsUnsubscribe) {
      _requestsUnsubscribe();
      _requestsUnsubscribe = null;
    }

    // تحديث نص زر تسجيل الدخول في القائمة
    const menuAuthBtn = document.getElementById('btn-menu-auth');
    if (menuAuthBtn) {
      if (user) {
        const name = user.displayName?.split(' ')[0] || 'لاعب';
        menuAuthBtn.innerHTML = `🚪 خروج (${name})`;
        menuAuthBtn.classList.add('logged-in');
      } else {
        menuAuthBtn.innerHTML = '🔑 تسجيل الدخول';
        menuAuthBtn.classList.remove('logged-in');
      }
    }

    if (user) {
      _requestsUnsubscribe = listenForIncomingRequests(user.uid, (requests) => {
        const badge = document.getElementById('community-badge');
        if (badge) {
          if (requests.length > 0) {
            badge.textContent = requests.length;
            badge.hidden = false;
          } else {
            badge.hidden = true;
          }
        }
      });
    } else {
      const badge = document.getElementById('community-badge');
      if (badge) badge.hidden = true;
    }
  });

  document.getElementById('btn-exit')
    .addEventListener('click', () => navigate('home'));

  document.getElementById('btn-settings')
    .addEventListener('click', () => navigate('settings'));
}
