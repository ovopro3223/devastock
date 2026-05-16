// ===== منطق صفحة القائمة الرئيسية =====
import { renderStock }      from './stock.js';
import { renderMuseumMain } from './museum.js';
import { renderProfile }    from './profile.js';
import { initForum }        from './forum.js';
import { listenForIncomingRequests, signInWithGoogle, signOutUser } from '../core/firebase.js';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

let _requestsUnsubscribe = null;

export function initMenu(navigate) {
  document.getElementById('btn-modes')
    .addEventListener('click', () => navigate('modes'));

  // زر المجتمع بجانب "ابدأ اللعب"
  document.getElementById('btn-community-hero')
    ?.addEventListener('click', () => navigate('community'));

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

  // زر المنتدى
  const forumBtn = document.getElementById('btn-forum-menu');
  if (forumBtn) {
    forumBtn.addEventListener('click', () => {
      initForum(navigate);
      navigate('forum');
    });
  }

  // زر الإنجازات
  const achievementsBtn = document.getElementById('btn-achievements-menu');
  if (achievementsBtn) {
    achievementsBtn.addEventListener('click', () => {
      navigate('achievements');
    });
  }

  // زر التحديات
  const challengesBtn = document.getElementById('btn-challenges-menu');
  if (challengesBtn) {
    challengesBtn.addEventListener('click', () => {
      navigate('challenges');
    });
  }

  // زر متجر التبديل
  const tradeBtn = document.getElementById('btn-trade-menu');
  if (tradeBtn) {
    tradeBtn.addEventListener('click', () => {
      navigate('trade');
    });
  }

  // ===== زر تسجيل الدخول / الخروج في القائمة =====
  const menuAuthBtn = document.getElementById('btn-menu-auth');
  if (menuAuthBtn) {
    menuAuthBtn.addEventListener('click', async () => {
      const auth = getAuth();
      if (auth.currentUser) {
        const { showGameConfirm } = await import('../core/dialogs.js');
        if (await showGameConfirm('هل تريد تسجيل الخروج؟')) {
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
        menuAuthBtn.textContent = `🚪 خروج (${name})`;
        menuAuthBtn.classList.add('logged-in');
      } else {
        menuAuthBtn.textContent = '🔑 تسجيل الدخول';
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
