// ===== الملف الشخصي =====
import { isProfileUnlocked, unlockProfile, getProfile, saveProfileField } from '../core/profile-storage.js';
import { getLetterCost, canAfford }  from '../core/museum-data.js';
import { getStock, spendLetters }    from '../core/storage.js';
import { getLifetimeTotal, getLevel, getLevelEmoji, getLevelProgress } from '../core/lifetime-storage.js';

// كلمة فتح الملف الشخصي
const UNLOCK_WORD = 'ملفي الشخصي';

// التطبيع لحساب التكلفة
const NORM  = { 'أ':'ا','إ':'ا','آ':'ا','ٱ':'ا','ة':'ه','ى':'ي' };
const VALID = new Set('ابتثجحخدذرزسشصضطظعغفقكلمنهوي');

function calcCost(text) {
  const cost = {};
  for (const c of text) {
    const n = NORM[c] ?? c;
    if (VALID.has(n)) cost[n] = (cost[n] || 0) + 1;
  }
  return cost;
}
function costTotal(cost) {
  return Object.values(cost).reduce((s, n) => s + n, 0);
}

// الحقول التي يمكن تعديلها
const FIELDS = [
  { key: 'name',    label: 'الاسم',         icon: '👤', type: 'text',     maxlen: 24, placeholder: 'اكتب اسمك...' },
  { key: 'age',     label: 'العمر',         icon: '🎂', type: 'number',   maxlen: 3,  placeholder: 'عمرك بالأرقام' },
  { key: 'city',    label: 'المدينة',       icon: '🏙️', type: 'text',     maxlen: 20, placeholder: 'مدينتك...' },
  { key: 'hobbies', label: 'الهوايات',      icon: '⭐', type: 'text',     maxlen: 50, placeholder: 'القراءة، السفر...' },
  { key: 'bio',     label: 'نبذة تعريفية', icon: '📝', type: 'textarea', maxlen: 80, placeholder: 'عرّف بنفسك بكلماتك...' },
  { key: 'quote',   label: 'مقولتي / حكمتي', icon: '💬', type: 'textarea', maxlen: 120, placeholder: 'اقتباس / بيت شعر / آية / لقب...' },
];

const AVATARS = ['👤','🧑','👨','👩','🧔','🧕','👦','👧','🧓','🦸','🦹','🥷','🧙','👑'];
const MAX_AVATAR_SIZE = 1024 * 1024;

let _navigate = null;
let _activeField = null; // المفتاح الذي يُعدَّل حالياً

// ===== التهيئة =====
export function initProfile(navigate) {
  _navigate = navigate;
}

// ===== عرض الصفحة =====
export function renderProfile() {
  const root = document.getElementById('profile-root');
  if (isProfileUnlocked()) {
    _renderUnlocked(root);
  } else {
    _renderLocked(root);
  }
}

// ===== واجهة القفل =====
function _renderLocked(root) {
  const unlockCost = getLetterCost(UNLOCK_WORD);
  const stock      = getStock();
  const affordable = canAfford(UNLOCK_WORD, stock);
  const total      = costTotal(unlockCost);

  const chips = Object.entries(unlockCost)
    .map(([c, n]) => {
      const has = (stock[c] || 0) >= n;
      return `<span class="profile-chip ${has ? 'ok' : 'miss'}">${c}<sup>${n}</sup></span>`;
    }).join('');

  root.innerHTML = `
    <div class="profile-lock-box">
      <div class="profile-lock-icon">🔒</div>
      <h3 class="profile-lock-title">ملفك الشخصي مقفل</h3>
      <p class="profile-lock-desc">لفتحه تحتاج ${total} حرفاً من حروف كلمة «الملف الشخصي»</p>
      <div class="profile-chips">${chips}</div>
      <button id="btn-do-unlock" class="btn btn-primary${affordable ? '' : ' btn-disabled'}"
              ${affordable ? '' : 'disabled'}>
        ${affordable ? '🔓 فتح الملف' : 'حروفك غير كافية'}
      </button>
    </div>`;

  if (affordable) {
    document.getElementById('btn-do-unlock').addEventListener('click', () => {
      spendLetters(unlockCost);
      unlockProfile();
      _renderUnlocked(root);
    });
  }
}

// ===== واجهة الملف المفتوح =====
function _renderUnlocked(root) {
  _activeField = null;
  const profile = getProfile();
  const total   = getLifetimeTotal();
  const level   = getLevel(total);
  const levelEmoji = getLevelEmoji(level);
  const levelProgress = getLevelProgress(total);
  const avatar  = profile.avatar || '👤';
  const avatarImage = profile.avatarImage || '';

  const avatarPickerHtml = AVATARS.map(e =>
    `<button class="avatar-btn${e === avatar ? ' active' : ''}" data-av="${e}">${e}</button>`
  ).join('');

  const fieldsHtml = FIELDS.map(f => {
    const val = profile[f.key] ?? '';
    return `
      <div class="pf-row" id="pfrow-${f.key}">
        <span class="pf-icon">${f.icon}</span>
        <div class="pf-body">
          <span class="pf-label">${f.label}</span>
          <div class="pf-view" id="pfview-${f.key}">
            ${val ? `<span class="pf-val">${val}</span>` : `<span class="pf-empty">${f.placeholder}</span>`}
            <button class="pf-edit-btn" data-key="${f.key}">✏️</button>
          </div>
          <div class="pf-edit-box" id="pfedit-${f.key}" hidden></div>
        </div>
      </div>`;
  }).join('');

  root.innerHTML = `
    <div class="profile-rank-bar">
      <span class="pr-emoji">${levelEmoji}</span>
      <span class="pr-label">لفل ${level}</span>
      <span class="pr-sep">|</span>
      <span class="pr-score">${levelProgress.progress}/${levelProgress.required} (${levelProgress.percent}%)</span>
    </div>
    <div class="profile-level-bar">
      <div class="profile-level-fill" style="width: ${levelProgress.percent}%"></div>
    </div>

    <div class="avatar-section">
      <div class="avatar-display" id="avatar-display">${avatarImage ? `<img src="${avatarImage}" alt="Avatar">` : avatar}</div>
      <div class="avatar-picker" id="avatar-picker" hidden>
        ${avatarPickerHtml}
      </div>
      <div class="profile-avatar-controls">
        <button id="btn-change-avatar" class="pf-edit-btn">✏️ الصورة</button>
        <button id="btn-upload-avatar" class="btn btn-primary btn-sm">📷 رفع صورة</button>
        ${avatarImage ? `<button id="btn-remove-avatar" class="btn btn-sm">🗑️ إزالة</button>` : ''}
        <input type="file" id="avatar-upload-input" accept="image/*" hidden>
      </div>
    </div>

    <div class="profile-fields">${fieldsHtml}</div>`;

  document.getElementById('btn-change-avatar').addEventListener('click', () => {
    const picker = document.getElementById('avatar-picker');
    picker.hidden = !picker.hidden;
  });

  const uploadInput = document.getElementById('avatar-upload-input');
  document.getElementById('btn-upload-avatar').addEventListener('click', () => {
    uploadInput.click();
  });

  uploadInput.addEventListener('change', () => {
    const file = uploadInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_SIZE) {
      import('../core/notifications.js').then(({ showGameNotification }) => {
        showGameNotification('الرجاء اختيار صورة أصغر من 1 ميجابايت.', 'warning');
      });
      uploadInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      saveProfileField('avatarImage', reader.result);
      saveProfileField('avatar', avatar || '👤');
      _renderUnlocked(root);
    };
    reader.readAsDataURL(file);
  });

  const removeButton = document.getElementById('btn-remove-avatar');
  if (removeButton) {
    removeButton.addEventListener('click', () => {
      saveProfileField('avatarImage', '');
      _renderUnlocked(root);
    });
  }

  root.querySelectorAll('.avatar-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const av = btn.dataset.av;
      saveProfileField('avatar', av);
      saveProfileField('avatarImage', '');
      _renderUnlocked(root);
    });
  });

  // أزرار تعديل الحقول
  root.querySelectorAll('.pf-edit-btn[data-key]').forEach(btn => {
    btn.addEventListener('click', () => _openEditor(btn.dataset.key));
  });
}

// ===== محرر الحقل =====
function _openEditor(key) {
  if (_activeField && _activeField !== key) _closeEditor(_activeField);
  _activeField = key;

  const field   = FIELDS.find(f => f.key === key);
  const profile = getProfile();
  const current = profile[key] ?? '';

  const editBox = document.getElementById(`pfedit-${key}`);
  const viewBox = document.getElementById(`pfview-${key}`);
  viewBox.hidden = true;
  editBox.hidden = false;

  const isTextarea = field.type === 'textarea';
  const inputHtml  = isTextarea
    ? `<textarea class="pf-input" id="pfinput-${key}" maxlength="${field.maxlen}" placeholder="${field.placeholder}">${current}</textarea>`
    : `<input class="pf-input" id="pfinput-${key}" type="${field.type}" maxlength="${field.maxlen}" placeholder="${field.placeholder}" value="${current}">`;

  editBox.innerHTML = `
    ${inputHtml}
    <div class="pf-cost-bar">
      <span class="pf-cost-label" id="pfcost-${key}">التكلفة: 0 حرف</span>
    </div>
    <div class="pf-actions">
      <button class="btn btn-primary btn-sm" id="pfsave-${key}">حفظ</button>
      <button class="btn btn-sm pf-cancel" id="pfcancel-${key}">إلغاء</button>
    </div>`;

  const input   = document.getElementById(`pfinput-${key}`);
  const costLbl = document.getElementById(`pfcost-${key}`);
  const saveBtn = document.getElementById(`pfsave-${key}`);

  function _updateCost() {
    if (field.type === 'number') { costLbl.textContent = 'مجاني'; return; }
    const cost  = calcCost(input.value);
    const total = costTotal(cost);
    const stock = getStock();
    const ok    = total === 0 || canAfford(input.value, stock);
    costLbl.textContent = total > 0 ? `التكلفة: ${total} حرف` : 'مجاني';
    costLbl.className   = `pf-cost-label ${ok ? 'ok' : 'miss'}`;
    saveBtn.disabled    = !ok;
  }

  input.addEventListener('input', _updateCost);
  _updateCost();

  document.getElementById(`pfsave-${key}`).addEventListener('click', () => {
    const val = input.value.trim();
    if (field.type !== 'number') spendLetters(calcCost(val));
    saveProfileField(key, val);
    _activeField = null;
    _rerenderField(key, val, field);
  });

  document.getElementById(`pfcancel-${key}`).addEventListener('click', () => {
    _closeEditor(key);
  });

  input.focus();
}

function _closeEditor(key) {
  const field   = FIELDS.find(f => f.key === key);
  const profile = getProfile();
  _rerenderField(key, profile[key] ?? '', field);
  _activeField = null;
}

function _rerenderField(key, val, field) {
  const editBox = document.getElementById(`pfedit-${key}`);
  const viewBox = document.getElementById(`pfview-${key}`);
  if (!editBox || !viewBox) return;
  viewBox.innerHTML = val
    ? `<span class="pf-val">${val}</span><button class="pf-edit-btn" data-key="${key}">✏️</button>`
    : `<span class="pf-empty">${field.placeholder}</span><button class="pf-edit-btn" data-key="${key}">✏️</button>`;
  viewBox.hidden = false;
  editBox.hidden = true;

  viewBox.querySelector('.pf-edit-btn').addEventListener('click', () => _openEditor(key));
}
