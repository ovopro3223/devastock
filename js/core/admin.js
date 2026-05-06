// ===== صلاحيات الأدمن =====
// الأدمن يقدر يرسل أحرف لأي لاعب — يكتب على users/{targetUid}.pendingGifts
// المستخدم المستهدف يأخذ الهدية لما يفتح اللعبة (pullFromCloud يدمجها بالمخزن)

import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export const ADMIN_UIDS = [
  'KyOf1zfyclMPwdg5KGBHf1Kpt952',
];

export function isAdmin(user) {
  if (!user) {
    user = getAuth().currentUser;
  }
  if (!user) return false;
  return ADMIN_UIDS.includes(user.uid);
}

// إرسال أحرف للاعب
// targetUid: معرف اللاعب
// letters: { 'ا': 100, 'ب': 50, ... }
// returns { ok, error? }
export async function sendLettersTo(targetUid, letters) {
  const me = getAuth().currentUser;
  if (!me || !isAdmin(me)) return { ok: false, error: 'not_admin' };
  if (!targetUid || !letters || Object.keys(letters).length === 0) {
    return { ok: false, error: 'invalid_args' };
  }

  try {
    const db = getFirestore();
    const userRef = doc(db, 'users', targetUid);
    const snap = await getDoc(userRef);
    const existingPending = (snap.exists() && snap.data().pendingGifts) || {};

    // ادمج الإضافة الجديدة مع المعلق
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
    console.error('Admin sendLettersTo error:', e);
    return { ok: false, error: e.message || 'unknown' };
  }
}
