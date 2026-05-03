const STORAGE_PREFIX = 'devastock_';
const listeners = new Map();

function storageKey(key) {
  return `${STORAGE_PREFIX}${key}`;
}

function readRaw(key) {
  const raw = localStorage.getItem(storageKey(key));
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeRaw(key, value) {
  localStorage.setItem(storageKey(key), JSON.stringify(value));
}

function emitChange(key, value) {
  const subs = listeners.get(key);
  if (!subs) return;
  subs.forEach((callback) => {
    try {
      callback(value);
    } catch (e) {
      console.error('AppState listener error', e);
    }
  });
}

export function getState(key, fallback = null) {
  const value = readRaw(key);
  return value === null ? fallback : value;
}

export function setState(key, value, { silent = false } = {}) {
  writeRaw(key, value);
  if (!silent) {
    emitChange(key, value);
  }
}

export function removeState(key) {
  localStorage.removeItem(storageKey(key));
  emitChange(key, null);
}

export function subscribeState(key, callback) {
  const subs = listeners.get(key) || [];
  subs.push(callback);
  listeners.set(key, subs);
  return () => unsubscribeState(key, callback);
}

export function unsubscribeState(key, callback) {
  const subs = listeners.get(key);
  if (!subs) return;
  listeners.set(key, subs.filter((fn) => fn !== callback));
}

export function getSettings() {
  return getState('settings', { muted: false, musicEnabled: true, volume: 0.8 });
}

export function setSettings(partial) {
  const existing = getSettings();
  const next = { ...existing, ...partial };
  setState('settings', next);
  return next;
}
