// ===== تخزين الإطارات (مملوكة + مرتداة) =====
import { getState, setState } from './app-state.js';
import { spendLetters, getStock } from './storage.js';
import { getLifetimeTotal, getLevel } from './lifetime-storage.js';
import { FRAMES, getFrameById } from './frames-data.js';

const STATE_KEY = 'frames_v1';

function _load() {
  const def = { owned: [], equipped: null };
  const raw = getState(STATE_KEY, def);
  if (!Array.isArray(raw.owned)) raw.owned = [];
  return raw;
}

function _save(state) {
  setState(STATE_KEY, state);
}

// ===== استعلامات =====
export function getOwnedFrames() {
  return _load().owned;
}

export function isFrameOwned(id) {
  const state = _load();
  return state.owned.includes(id) || _isAutoOwned(id);
}

// إطار "ناسج" يصير مملوك تلقائياً عند لفل 5
function _isAutoOwned(id) {
  const f = getFrameById(id);
  if (!f) return false;
  if (f.cost === 0 && f.levelReq > 0) {
    const level = getLevel(getLifetimeTotal());
    return level >= f.levelReq;
  }
  return false;
}

export function getEquippedFrame() {
  const eq = _load().equipped;
  if (!eq) return null;
  if (!isFrameOwned(eq)) return null;
  return getFrameById(eq);
}

export function getEquippedFrameId() {
  const eq = _load().equipped;
  if (!eq) return null;
  if (!isFrameOwned(eq)) return null;
  return eq;
}

// ===== شراء =====
// يرجع { ok, reason? }
export function purchaseFrame(id) {
  const frame = getFrameById(id);
  if (!frame) return { ok: false, reason: 'invalid' };

  if (isFrameOwned(id)) return { ok: false, reason: 'already_owned' };

  // إذا كان مجاني (متطلب لفل)
  if (frame.cost === 0) {
    if (frame.levelReq > 0) {
      const level = getLevel(getLifetimeTotal());
      if (level < frame.levelReq) {
        return { ok: false, reason: 'level_too_low', need: frame.levelReq, have: level };
      }
    }
    // ما يحتاج تخزين — _isAutoOwned يديره
    return { ok: true, autoOwned: true };
  }

  // مدفوع: اخصم من المخزن (الأكثر وفرة أولاً)
  const stock = getStock();
  const totalAvailable = Object.values(stock).reduce((s, n) => s + n, 0);
  if (totalAvailable < frame.cost) {
    return { ok: false, reason: 'not_enough_letters', need: frame.cost, have: totalAvailable };
  }

  let toDeduct = frame.cost;
  const sorted = Object.entries(stock).sort((a, b) => b[1] - a[1]);
  const deduction = {};
  for (const [letter, count] of sorted) {
    if (toDeduct <= 0) break;
    const take = Math.min(toDeduct, count);
    if (take > 0) {
      deduction[letter] = take;
      toDeduct -= take;
    }
  }
  if (toDeduct > 0) return { ok: false, reason: 'not_enough_letters' };

  spendLetters(deduction);

  const state = _load();
  if (!state.owned.includes(id)) state.owned.push(id);
  _save(state);
  return { ok: true };
}

// ===== ارتداء =====
export function equipFrame(id) {
  if (!isFrameOwned(id)) return { ok: false, reason: 'not_owned' };
  const state = _load();
  state.equipped = id;
  _save(state);
  return { ok: true };
}

export function unequipFrame() {
  const state = _load();
  state.equipped = null;
  _save(state);
}
