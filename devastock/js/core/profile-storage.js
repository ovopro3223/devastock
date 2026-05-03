import { getState, setState } from './app-state.js';

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
  profile[key] = value;
  setState('profile', profile);
}
