import { getState, setState } from './app-state.js';
import { sanitizeUserInput, sanitizeName } from './sanitize.js';

// حدود طول كل حقل
const FIELD_LIMITS = {
  name:    24,
  age:     3,
  city:    20,
  hobbies: 50,
  bio:     80,
  quote:   120,
};

export function isProfileUnlocked() {
  return getState('profile_unlocked', false) === true;
}

export function unlockProfile() {
  setState('profile_unlocked', true);
}

export function getProfile() {
  return getState('profile', {});
}

export function saveProfileField(key, value) {
  const profile = getProfile();
  const limit = FIELD_LIMITS[key] ?? 200;
  // الاسم يستخدم تنقية أصرم (بدون newlines)
  const cleaned = key === 'name' ? sanitizeName(value, limit) : sanitizeUserInput(value, limit);
  profile[key] = cleaned;
  setState('profile', profile);
}
