// ===== صلاحيات الأدمن =====
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
         collection, query, orderBy, getDocs, serverTimestamp } from 'firebase/firestore';

export const ADMIN_UIDS = [
  'KyOf1zfyclMPwdg5KGBHf1Kpt952',
];

export function isAdmin(user) {
  if (!user) user = getAuth().currentUser;
  if (!user) return false;
  return ADMIN_UIDS.includes(user.uid);
}

function _requireAdmin() {
  const me = getAuth().currentUser;
  if (!me || !isAdmin(me)) throw new Error('not_admin');
  return me;
}

// ===== إرسال أحرف للاعب =====
export async function sendLettersTo(targetUid, letters) {
  try {
    _requireAdmin();
  } catch { return { ok: false, error: 'not_admin' }; }

  if (!targetUid || !letters || Object.keys(letters).length === 0) {
    return { ok: false, error: 'invalid_args' };
  }

  try {
    const db = getFirestore();
    const userRef = doc(db, 'users', targetUid);
    const snap = await getDoc(userRef);
    const existingPending = (snap.exists() && snap.data().pendingGifts) || {};
    const merged = { ...existingPending };
    for (const [ch, n] of Object.entries(letters)) {
      merged[ch] = (merged[ch] || 0) + Math.max(0, Math.floor(n));
    }
    await setDoc(userRef, {
      pendingGifts: merged,
      pendingGiftsUpdatedAt: serverTimestamp(),
    }, { merge: true });
    return { ok: true };
  } catch (e) {
    console.error('sendLettersTo error:', e);
    return { ok: false, error: e.message || 'unknown' };
  }
}

// ===== جلب بيانات لاعب كاملة =====
export async function getPlayerFullData(targetUid) {
  try { _requireAdmin(); } catch { return { ok: false, error: 'not_admin' }; }
  try {
    const db = getFirestore();
    const [userSnap, lbSnap] = await Promise.all([
      getDoc(doc(db, 'users', targetUid)),
      getDoc(doc(db, 'leaderboard', targetUid)),
    ]);
    const userData = userSnap.exists() ? userSnap.data() : {};
    const lbData = lbSnap.exists() ? lbSnap.data() : {};
    return { ok: true, user: userData, lb: lbData };
  } catch (e) {
    return { ok: false, error: e.message || 'unknown' };
  }
}

// ===== تصفير مخزن لاعب =====
export async function clearPlayerStock(targetUid) {
  try { _requireAdmin(); } catch { return { ok: false, error: 'not_admin' }; }
  try {
    const db = getFirestore();
    await setDoc(doc(db, 'users', targetUid), { stock: {} }, { merge: true });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ===== تعيين إجمالي الحروف (يحدد اللفل) =====
export async function setPlayerLifetimeTotal(targetUid, totalLetters) {
  try { _requireAdmin(); } catch { return { ok: false, error: 'not_admin' }; }
  if (totalLetters < 0 || !Number.isFinite(totalLetters)) {
    return { ok: false, error: 'invalid_total' };
  }
  try {
    const db = getFirestore();
    // وزّع على الـ28 حرف بشكل متساوٍ
    const ARABIC = ['ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي'];
    const per = Math.floor(totalLetters / ARABIC.length);
    const remainder = totalLetters - per * ARABIC.length;
    const lifetime = {};
    ARABIC.forEach((c, i) => { lifetime[c] = per + (i < remainder ? 1 : 0); });
    await setDoc(doc(db, 'users', targetUid), { lifetime }, { merge: true });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ===== منح إطار للاعب =====
export async function grantFrameTo(targetUid, frameId) {
  try { _requireAdmin(); } catch { return { ok: false, error: 'not_admin' }; }
  try {
    const db = getFirestore();
    const userRef = doc(db, 'users', targetUid);
    const snap = await getDoc(userRef);
    const existing = (snap.exists() && snap.data().frames) || { owned: [], equipped: null };
    const owned = Array.from(new Set([...(existing.owned || []), frameId]));
    await setDoc(userRef, { frames: { ...existing, owned } }, { merge: true });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ===== حظر / فك حظر لاعب =====
export async function setPlayerBanned(targetUid, banned, reason = '') {
  try { _requireAdmin(); } catch { return { ok: false, error: 'not_admin' }; }
  try {
    const db = getFirestore();
    await setDoc(doc(db, 'users', targetUid), {
      banned: !!banned,
      banReason: banned ? reason : '',
      bannedAt: banned ? serverTimestamp() : null,
    }, { merge: true });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ===== إعلان عام =====
export async function sendBroadcast(message) {
  try { _requireAdmin(); } catch { return { ok: false, error: 'not_admin' }; }
  if (!message || !message.trim()) return { ok: false, error: 'empty' };
  try {
    const db = getFirestore();
    await setDoc(doc(db, 'announcements', 'global'), {
      message: message.trim(),
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ===== حذف منشور بالمنتدى (override) =====
export async function adminDeleteForumPost(postId) {
  try { _requireAdmin(); } catch { return { ok: false, error: 'not_admin' }; }
  try {
    const db = getFirestore();
    await deleteDoc(doc(db, 'forumPosts', postId));
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ===== جلب آخر المنشورات للمعاينة =====
export async function getRecentForumPosts(limit = 30) {
  try { _requireAdmin(); } catch { return { ok: false, error: 'not_admin' }; }
  try {
    const db = getFirestore();
    const q = query(collection(db, 'forumPosts'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const posts = [];
    snap.forEach(d => posts.push({ id: d.id, ...d.data() }));
    return { ok: true, posts: posts.slice(0, limit) };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ===== التحقق من إعلان جديد للاعب =====
// يُستدعى عند بدء التطبيق
export async function checkForBroadcast() {
  try {
    const db = getFirestore();
    const snap = await getDoc(doc(db, 'announcements', 'global'));
    if (!snap.exists()) return null;
    const data = snap.data();
    const lastSeen = parseInt(localStorage.getItem('devastock_last_announcement') || '0', 10);
    const ts = data.createdAtMs || 0;
    if (ts > lastSeen && data.message) {
      localStorage.setItem('devastock_last_announcement', String(ts));
      return data.message;
    }
    return null;
  } catch {
    return null;
  }
}

// ===== التحقق من حظر اللاعب الحالي =====
export async function checkIfBanned() {
  try {
    const me = getAuth().currentUser;
    if (!me) return { banned: false };
    const db = getFirestore();
    const snap = await getDoc(doc(db, 'users', me.uid));
    if (!snap.exists()) return { banned: false };
    const data = snap.data();
    return { banned: !!data.banned, reason: data.banReason || '' };
  } catch {
    return { banned: false };
  }
}
