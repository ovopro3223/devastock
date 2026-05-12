// ===== مربعات حوار داخل اللعبة (بدائل alert/confirm/prompt) =====
import { showGameNotification } from './notifications.js';

let _modal = null;
let _msgEl = null;
let _inputEl = null;
let _inputRow = null;
let _okBtn = null;
let _cancelBtn = null;
let _overlay = null;
let _activeResolve = null;
let _activeMode = null;

function _ensureModal() {
  if (_modal) return;
  _modal      = document.getElementById('game-dialog-modal');
  _overlay    = _modal?.querySelector('.game-dialog-overlay');
  _msgEl      = document.getElementById('game-dialog-message');
  _inputEl    = document.getElementById('game-dialog-input');
  _inputRow   = document.getElementById('game-dialog-input-row');
  _okBtn      = document.getElementById('game-dialog-ok');
  _cancelBtn  = document.getElementById('game-dialog-cancel');

  if (!_modal || !_msgEl || !_okBtn || !_cancelBtn) return;

  _okBtn.addEventListener('click', () => _close(_activeMode === 'prompt' ? (_inputEl?.value ?? '') : true));
  _cancelBtn.addEventListener('click', () => _close(_activeMode === 'prompt' ? null : false));
  if (_overlay) _overlay.addEventListener('click', () => _close(_activeMode === 'prompt' ? null : false));

  // Enter يعادل OK، Esc يعادل Cancel
  _modal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      _okBtn.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      _cancelBtn.click();
    }
  });
}

function _close(value) {
  if (!_modal) return;
  _modal.hidden = true;
  const r = _activeResolve;
  _activeResolve = null;
  _activeMode = null;
  if (typeof r === 'function') r(value);
}

function _open({ mode, message, okLabel, cancelLabel, defaultValue }) {
  _ensureModal();
  if (!_modal) {
    // Fallback آمن لو الـ modal مش متاح
    if (mode === 'confirm') return Promise.resolve(true);
    if (mode === 'prompt') return Promise.resolve(defaultValue ?? '');
    return Promise.resolve();
  }

  _activeMode = mode;
  _msgEl.textContent = message || '';
  _okBtn.textContent = okLabel || (mode === 'prompt' ? 'موافق' : 'نعم');
  _cancelBtn.textContent = cancelLabel || (mode === 'prompt' ? 'إلغاء' : 'لا');
  _cancelBtn.hidden = mode === 'alert';

  if (mode === 'prompt') {
    if (_inputRow) _inputRow.hidden = false;
    if (_inputEl) {
      _inputEl.value = defaultValue ?? '';
      setTimeout(() => _inputEl.focus(), 50);
    }
  } else {
    if (_inputRow) _inputRow.hidden = true;
  }

  _modal.hidden = false;
  return new Promise(resolve => { _activeResolve = resolve; });
}

export function showGameConfirm(message, opts = {}) {
  return _open({
    mode: 'confirm',
    message,
    okLabel: opts.okLabel,
    cancelLabel: opts.cancelLabel,
  });
}

export function showGamePrompt(message, defaultValue = '', opts = {}) {
  return _open({
    mode: 'prompt',
    message,
    defaultValue,
    okLabel: opts.okLabel,
    cancelLabel: opts.cancelLabel,
  });
}

// alert سيكوي — بدون أزرار، يستخدم نظام الـ toast الموجود
export function showGameAlert(message, type = 'info') {
  showGameNotification(message, type);
  return Promise.resolve();
}
