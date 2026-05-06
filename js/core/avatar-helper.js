// ===== مساعد عرض الأفاتار مع إطار اختياري =====
import { getFrameById, getFrameUrl } from './frames-data.js';
import { getEquippedFrameId } from './frames-storage.js';

// ينتج HTML للأفاتار مع إطار (إن وجد)
// opts:
//   uid: المعرف (للأفاتار الخاص بمستخدم آخر — نأخذ frame من leaderboard data)
//   avatarImage: رابط الصورة (إن وجد)
//   avatarEmoji: emoji احتياطي
//   frameId: معرف الإطار (إن كان معروفاً مسبقاً، مثل من leaderboard data)
//   size: حجم بالبكسل (الافتراضي 'auto' — يأخذ حجم الـwrapper)
export function renderAvatarHtml({ avatarImage, avatarEmoji, frameId, isSelf = false, size = null, wrapperClass = '' }) {
  // إذا كان self، استخدم الإطار المرتدى من التخزين المحلي
  if (isSelf) frameId = frameId || getEquippedFrameId();

  const frame = frameId ? getFrameById(frameId) : null;
  const sizeStyle = size ? `width:${size}px;height:${size}px;` : '';

  const inner = avatarImage
    ? `<img class="avatar-inner" src="${escapeHtml(avatarImage)}" alt="">`
    : `<div class="avatar-inner avatar-emoji">${escapeHtml(avatarEmoji || '👤')}</div>`;

  const frameOverlay = frame
    ? `<img class="frame-overlay" src="${getFrameUrl(frame)}" alt="">`
    : '';

  const cls = `avatar-frame-wrap${frame ? ' has-frame' : ''}${wrapperClass ? ' ' + wrapperClass : ''}`;
  return `<span class="${cls}" style="${sizeStyle}">${inner}${frameOverlay}</span>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
