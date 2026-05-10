import { playNotificationSound } from './audio.js';

const TYPE_ICONS = {
  info: '🔔',
  success: '✅',
  warning: '⚠️',
  error: '❌',
};

let _toastQueue = [];
let _toastShowing = false;

export function showGameNotification(message, type = 'info') {
  _toastQueue.push({ message, type });
  if (!_toastShowing) _showNextToast();
}

function _showNextToast() {
  if (_toastQueue.length === 0) {
    _toastShowing = false;
    return;
  }

  _toastShowing = true;
  const { message, type } = _toastQueue.shift();
  const toast = document.getElementById('game-toast');
  const icon = document.getElementById('game-toast-icon');
  const title = document.getElementById('game-toast-title');

  if (!toast || !icon || !title) {
    _toastShowing = false;
    return;
  }

  ['type-info', 'type-success', 'type-warning', 'type-error'].forEach(cls => toast.classList.remove(cls));
  toast.classList.add(`type-${type}`);
  icon.textContent = TYPE_ICONS[type] || TYPE_ICONS.info;
  title.textContent = message;

  toast.hidden = false;
  toast.classList.add('show');
  playNotificationSound();

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.hidden = true;
      _showNextToast();
    }, 400);
  }, 3200);
}
