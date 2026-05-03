// ===== تهيئة Firebase والمصادقة =====
import { initializeApp }                              from 'firebase/app';
import { getAuth, GoogleAuthProvider,
         signInWithPopup, signOut,
         onAuthStateChanged }                         from 'firebase/auth';
import { getFirestore, collection, query, where,
         getDocs, addDoc, doc, getDoc, setDoc, updateDoc,
         deleteDoc, serverTimestamp, arrayUnion, orderBy, onSnapshot }   from 'firebase/firestore';
import { FIREBASE_CONFIG }                            from './firebase-config.js';
import { pullFromCloud, setupSync }                   from './cloud-sync.js';

const _app  = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(_app);
export const db   = getFirestore(_app);

const _googleProvider = new GoogleAuthProvider();

// ===== تسجيل الدخول =====
export async function signInWithGoogle() {
  try {
    // أغلق الـ modal قبل فتح popup
    const modal = document.getElementById('auth-modal');
    if (modal) modal.hidden = true;

    await signInWithPopup(auth, _googleProvider);
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') {
      console.error('login error:', e.code, e.message);
      alert(`خطأ في تسجيل الدخول: ${e.message}`);
    }
  }
}

// ===== تسجيل الخروج =====
export function signOutUser() {
  return signOut(auth);
}

// ===== مراقبة حالة المستخدم =====
// يُستدعى من main.js مرة واحدة عند بدء التطبيق
export function initAuth(onUserChanged) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      setupSync(db, user.uid);   // فعّل المزامنة التلقائية
      await pullFromCloud(db, user.uid); // اجلب بيانات المستخدم من السحابة
      await ensureLeaderboardEntry(user); // أنشئ entry في leaderboard
    } else {
      setupSync(null, null);     // أوقف المزامنة
    }
    onUserChanged(user);
  });
}

// أنشئ entry في leaderboard عند تسجيل الدخول
async function ensureLeaderboardEntry(user) {
  try {
    const leaderboardRef = doc(db, 'leaderboard', user.uid);
    const existingDoc = await getDoc(leaderboardRef);

    if (!existingDoc.exists()) {
      // إذا ما في entry، أنشئها
      await setDoc(leaderboardRef, {
        displayName: user.displayName || 'لاعب',
        score: 0,
        rankEmoji: '🌱',
        rankLabel: 'مبتدئ',
        updatedAt: serverTimestamp(),
      });
      console.log('Leaderboard entry created for:', user.displayName);
    }
  } catch (e) {
    console.error('Error ensuring leaderboard entry:', e);
  }
}

// ===== دوال المجتمع =====

// الحصول على قائمة كل اللاعبين من leaderboard
export async function getPlayers() {
  try {
    const snap = await getDocs(collection(db, 'leaderboard'));
    const players = [];
    snap.forEach((doc) => {
      const data = doc.data();
      players.push({
        uid: doc.id,
        displayName: data.displayName || 'لاعب',
        avatar: data.avatar || '👤',
        avatarImage: data.avatarImage || '',
        score: data.score || 0,
        rankEmoji: data.rankEmoji || '🌱',
        rankLabel: data.rankLabel || 'مبتدئ',
        seasonScore: data.seasonScore || 0,
        seasonId:    data.seasonId || '',
        tierId:      data.tierId || 'bronze',
        tierLabel:   data.tierLabel || 'برونزي',
        tierEmoji:   data.tierEmoji || '🥉',
      });
    });
    return players.sort((a, b) => b.score - a.score); // مرتب حسب الدرجة
  } catch (e) {
    console.error('Error fetching players:', e);
    return [];
  }
}

// الحصول على الأصدقاء الحاليين للمستخدم
export async function getFriends(uid) {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    const friends = userDoc.data()?.friends || [];

    // اجلب بيانات كل صديق من leaderboard
    const friendsData = [];
    for (const friendUid of friends) {
      const friendDoc = await getDoc(doc(db, 'leaderboard', friendUid));
      if (friendDoc.exists()) {
        const friendData = friendDoc.data();
        friendsData.push({
          uid: friendUid,
          displayName: friendData.displayName || 'لاعب',
          avatar: friendData.avatar || '👤',
          avatarImage: friendData.avatarImage || '',
          score: friendData.score || 0,
          rankEmoji: friendData.rankEmoji || '🌱',
          rankLabel: friendData.rankLabel || 'مبتدئ',
        });
      }
    }
    return friendsData;
  } catch (e) {
    console.error('Error fetching friends:', e);
    return [];
  }
}

// إرسال طلب صداقة
export async function sendFriendRequest(fromUid, toUid, fromName) {
  console.log('📨 Sending friend request from', fromUid, 'to', toUid, 'name:', fromName);
  if (fromUid === toUid) {
    console.log('⚠️ Cannot send request to self');
    return;
  }
  try {
    // إذا كان هناك طلب متبادل (الطرف الآخر بعت طلب أول) → اقبل تلقائياً
    const reverseQuery = query(
      collection(db, 'friendRequests'),
      where('from', '==', toUid),
      where('to', '==', fromUid),
      where('status', '==', 'pending')
    );
    const reverseSnap = await getDocs(reverseQuery);
    if (!reverseSnap.empty) {
      const reverseDoc = reverseSnap.docs[0];
      console.log('✨ Mutual request detected - auto-accepting', reverseDoc.id);
      await acceptFriendRequest(reverseDoc.id, toUid, fromUid);
      return true;
    }

    // إذا كان هناك طلب سابق من نفس الشخص إلى نفس المستخدم بالفعل
    const existingQuery = query(
      collection(db, 'friendRequests'),
      where('from', '==', fromUid),
      where('to', '==', toUid),
      where('status', '==', 'pending')
    );
    const existingSnap = await getDocs(existingQuery);
    if (!existingSnap.empty) {
      console.log('⚠️ Request already sent');
      return false;
    }

    const friendRequestsRef = collection(db, 'friendRequests');
    const newDoc = await addDoc(friendRequestsRef, {
      from: fromUid,
      to: toUid,
      fromName: fromName || 'لاعب',
      toName: '',
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    console.log('✅ Friend request sent successfully:', newDoc.id);
    return true;
  } catch (e) {
    console.error('❌ Error sending request:', e.code, e.message);
    return false;
  }
}

// ===== الشات =====

// إنشاء معرف الشات بين لاعبين (مرتب أبجدياً لضمان التوافق بين الطرفين)
function getChatId(uid1, uid2) {
  return [uid1, uid2].sort().join('_');
}

// إرسال رسالة
export async function sendChatMessage(fromUid, toUid, fromName, text) {
  if (!text.trim()) return;
  try {
    const chatId = getChatId(fromUid, toUid);
    const msgsRef = collection(db, 'chats', chatId, 'messages');

    await setDoc(doc(msgsRef), {
      from: fromUid,
      to: toUid,
      fromName: fromName || 'لاعب',
      text: text.trim(),
      createdAt: serverTimestamp(),
    });

    // تحديث آخر رسالة في وثيقة الشات
    await setDoc(doc(db, 'chats', chatId), {
      participants: [fromUid, toUid].sort(),
      lastMessage: text.trim(),
      lastFromUid: fromUid,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.error('Error sending message:', e);
  }
}

// الاستماع للرسائل في الوقت الفعلي
export function listenForMessages(uid1, uid2, callback) {
  try {
    const chatId = getChatId(uid1, uid2);
    const msgsRef = collection(db, 'chats', chatId, 'messages');
    const q = query(msgsRef);

    return onSnapshot(q, (snap) => {
      const messages = [];
      snap.forEach((doc) => {
        const data = doc.data();
        messages.push({
          id: doc.id,
          from: data.from,
          to: data.to,
          fromName: data.fromName,
          text: data.text,
          createdAt: data.createdAt?.toDate() || new Date(),
        });
      });
      // ترتيب حسب الوقت
      messages.sort((a, b) => a.createdAt - b.createdAt);
      callback(messages);
    });
  } catch (e) {
    console.error('Error listening to messages:', e);
    return () => {};
  }
}

// الحصول على بروفايل لاعب من leaderboard + users
export async function getPlayerProfile(uid) {
  try {
    const lbDoc = await getDoc(doc(db, 'leaderboard', uid));
    const userDoc = await getDoc(doc(db, 'users', uid));
    const lbData = lbDoc.exists() ? lbDoc.data() : {};
    const userData = userDoc.exists() ? userDoc.data() : {};
    const profile = userData.profile || {};

    return {
      uid,
      displayName: profile.name || lbData.displayName || 'لاعب',
      avatar: profile.avatar || lbData.avatar || '👤',
      avatarImage: profile.avatarImage || '',
      score: lbData.score || 0,
      totalLetters: lbData.totalLetters || 0,
      rankEmoji: lbData.rankEmoji || '🌱',
      rankLabel: lbData.rankLabel || 'لفل 1',
      profile,
      friends: userData.friends || [],
    };
  } catch (e) {
    console.error('Error fetching profile:', e);
    return null;
  }
}

// مراقبة طلبات الصداقة في الوقت الفعلي
export function listenForIncomingRequests(uid, callback) {
  console.log('🔔 Setting up requests listener for uid:', uid);
  try {
    const q = query(
      collection(db, 'friendRequests'),
      where('to', '==', uid),
      where('status', '==', 'pending')
    );

    return onSnapshot(q, (snap) => {
      console.log('🔔 Received requests snapshot. Size:', snap.size);
      const requests = [];
      snap.forEach((doc) => {
        const data = doc.data();
        console.log('🔔 Found request:', doc.id, data);
        requests.push({
          id: doc.id,
          fromUid: data.from,
          fromName: data.fromName || 'لاعب',
        });
      });
      console.log('🔔 Total pending requests:', requests.length);
      callback(requests);
    }, (error) => {
      console.error('❌ Error listening for requests:', error.code, error.message);
      console.error('Full error:', error);
    });
  } catch (e) {
    console.error('❌ Error setting up listener:', e);
    return () => {};
  }
}

// الحصول على طلبات الصداقة الواردة
export async function getIncomingRequests(uid) {
  try {
    const q = query(collection(db, 'friendRequests'), where('to', '==', uid), where('status', '==', 'pending'));
    const snap = await getDocs(q);
    const requests = [];
    snap.forEach((doc) => {
      requests.push({
        id: doc.id,
        fromUid: doc.data().from,
        fromName: doc.data().fromName || 'لاعب',
      });
    });
    return requests;
  } catch (e) {
    console.error('Error fetching requests:', e);
    return [];
  }
}

// الحصول على طلبات الصداقة المرسلة
export async function getOutgoingRequests(uid) {
  try {
    const q = query(collection(db, 'friendRequests'), where('from', '==', uid), where('status', '==', 'pending'));
    const snap = await getDocs(q);
    const requests = [];
    snap.forEach((doc) => {
      requests.push({
        id: doc.id,
        toUid: doc.data().to,
        toName: doc.data().toName || '',
      });
    });
    return requests;
  } catch (e) {
    console.error('Error fetching outgoing requests:', e);
    return [];
  }
}

export function listenForOutgoingRequests(uid, callback) {
  try {
    const q = query(collection(db, 'friendRequests'), where('from', '==', uid), where('status', '==', 'pending'));
    return onSnapshot(q, (snap) => {
      const requests = [];
      snap.forEach((doc) => {
        const data = doc.data();
        requests.push({
          id: doc.id,
          toUid: data.to,
          toName: data.toName || '',
        });
      });
      callback(requests);
    }, (error) => {
      console.error('❌ Error listening for outgoing requests:', error.code, error.message);
    });
  } catch (e) {
    console.error('❌ Error setting up outgoing requests listener:', e);
    return () => {};
  }
}

export function listenForForumPosts(callback) {
  try {
    const q = query(collection(db, 'forumPosts'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      const posts = [];
      snap.forEach((doc) => {
        const data = doc.data();
        posts.push({
          id: doc.id,
          authorUid: data.authorUid,
          authorName: data.authorName || 'لاعب',
          content: data.content || '',
          createdAt: data.createdAt?.toDate() || new Date(),
        });
      });
      callback(posts);
    });
  } catch (e) {
    console.error('Error listening for forum posts:', e);
    return () => {};
  }
}

export function listenForForumComments(postId, callback) {
  try {
    const q = query(collection(db, 'forumPosts', postId, 'comments'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snap) => {
      const comments = [];
      snap.forEach((doc) => {
        const data = doc.data();
        comments.push({
          id: doc.id,
          authorUid: data.authorUid,
          authorName: data.authorName || 'لاعب',
          content: data.content || '',
          createdAt: data.createdAt?.toDate() || new Date(),
        });
      });
      callback(comments);
    });
  } catch (e) {
    console.error('Error listening for forum comments:', e);
    return () => {};
  }
}

export function listenForForumLikes(postId, callback) {
  try {
    const q = query(collection(db, 'forumPosts', postId, 'likes'));
    return onSnapshot(q, (snap) => {
      const likes = [];
      snap.forEach((doc) => likes.push(doc.id));
      callback(likes);
    });
  } catch (e) {
    console.error('Error listening for forum likes:', e);
    return () => {};
  }
}

export async function createForumPost(authorUid, authorName, content) {
  try {
    if (!authorUid || !content.trim()) {
      return { success: false, error: 'Invalid author or empty content.' };
    }
    const postRef = await addDoc(collection(db, 'forumPosts'), {
      authorUid,
      authorName,
      content: content.trim(),
      createdAt: serverTimestamp(),
    });
    return { success: true, id: postRef.id };
  } catch (e) {
    console.error('Error creating forum post:', e);
    return { success: false, error: e.message || 'Unknown error' };
  }
}

export async function deleteForumPost(postId, authorUid) {
  try {
    if (!postId || !authorUid) return { success: false, error: 'Invalid request.' };
    const postRef = doc(db, 'forumPosts', postId);
    await deleteDoc(postRef);
    return { success: true };
  } catch (e) {
    console.error('Error deleting forum post:', e);
    return { success: false, error: e.message || 'Unknown error' };
  }
}

export async function addForumComment(postId, authorUid, authorName, content) {
  try {
    if (!postId || !authorUid || !content.trim()) return null;
    const commentRef = await addDoc(collection(db, 'forumPosts', postId, 'comments'), {
      authorUid,
      authorName,
      content: content.trim(),
      createdAt: serverTimestamp(),
    });
    return commentRef.id;
  } catch (e) {
    console.error('Error adding forum comment:', e);
    return null;
  }
}

export async function likeForumPost(postId, userUid) {
  try {
    if (!postId || !userUid) return;
    await setDoc(doc(db, 'forumPosts', postId, 'likes', userUid), {
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('Error liking forum post:', e);
  }
}

export async function unlikeForumPost(postId, userUid) {
  try {
    if (!postId || !userUid) return;
    await deleteDoc(doc(db, 'forumPosts', postId, 'likes', userUid));
  } catch (e) {
    console.error('Error unliking forum post:', e);
  }
}

// قبول طلب صداقة
export async function acceptFriendRequest(reqId, fromUid, toUid) {
  try {
    // حدّث حالة الطلب
    await updateDoc(doc(db, 'friendRequests', reqId), { status: 'accepted' });

    // أضف كل واحد لقائمة أصدقاء الآخر (يحتاج صلاحيات في Firestore)
    await setDoc(doc(db, 'users', toUid), {
      friends: arrayUnion(fromUid),
    }, { merge: true });

    await setDoc(doc(db, 'users', fromUid), {
      friends: arrayUnion(toUid),
    }, { merge: true });
  } catch (e) {
    console.error('Error accepting request:', e);
  }
}

// رفض طلب صداقة
export async function rejectFriendRequest(reqId) {
  try {
    await updateDoc(doc(db, 'friendRequests', reqId), { status: 'rejected' });
  } catch (e) {
    console.error('Error rejecting request:', e);
  }
}
