import { getSettings, setSettings, subscribeState } from './app-state.js';

const DEFAULT_SETTINGS = { muted: false, musicEnabled: true, volume: 0.8 };

let _ctx = null;
let _muted = false;
let _musicEnabled = true;
let _volume = DEFAULT_SETTINGS.volume;
let _ambientGain = null;
let _ambientOsc = null;
let _engineGain = null;
let _engineOsc = null;
let _resumeListenerAttached = false;
let _settingsUnsub = null;

// خريطة الملفات الصوتية
const SOUND_FILES = {
  // أصوات رئيسية
  'letter-collecting': 'assets/sounds/main/letter collecting.mp3',
  'achievement': 'assets/sounds/main/achivment.mp3',
  'notification': 'assets/sounds/main/Notification.mp3',
  'page-opening': 'assets/sounds/main/page opening.mp3',
  'start-game': 'assets/sounds/main/start game sound.mp3',
  'museum-words-opening': 'assets/sounds/main/musiem words opening.mp3',
  'background-music': 'assets/sounds/main/background music.mp3',
  'key-sfx': 'assets/sounds/main/mrstokes302-key-videogame-sfx-mrstokes302-423629.mp3',
  
  // أصوات القناصة
  'shot': 'assets/sounds/sniper/shot.mp3',
  'hit': 'assets/sounds/sniper/hit.mp3',
  'miss-hit': 'assets/sounds/sniper/miss hit.mp3',
  'loose': 'assets/sounds/sniper/loose.mp3',
  'win': 'assets/sounds/sniper/win.mp3',
  'scope-on': 'assets/sounds/sniper/scope on.mp3',
  
  // أصوات الصيد
  'fishing-net-threw': 'assets/sounds/fishing/fishing net threw.mp3',
  'gathering-fishes': 'assets/sounds/fishing/gathering fishes.mp3',
  
  // أصوات التاكسي
  'crash': 'assets/sounds/taxi/crash.mp3',
  'engine-sound': 'assets/sounds/taxi/engine sound.mp3',
  'letter-gathering-taxi': 'assets/sounds/taxi/letter gathering.mp3',
  
  // أصوات الكازينو
  'jackpot': 'assets/sounds/casino/jackpot.mp3',
  'loose-casino': 'assets/sounds/casino/loose.mp3',
  'spining': 'assets/sounds/casino/spining.mp3',
  'stop': 'assets/sounds/casino/stop.mp3',
  
  // أصوات مطر الحروف
  'game-over': 'assets/sounds/rain letter/game over.mp3',
  'heart-loosing': 'assets/sounds/rain letter/heart loosing.mp3',
  'ice-freez': 'assets/sounds/rain letter/ice freez.mp3',
  'letter-gathering-rain': 'assets/sounds/rain letter/letter gathering.mp3',
  'rain-sound': 'assets/sounds/rain letter/rain sound.mp3',
};

let _loadedSounds = new Map();
let _backgroundBuffer = null;
let _backgroundBufferPromise = null;
let _backgroundSource = null;
let _backgroundGain = null;
let _engineAudio = null;

function _suppressMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
    ['play','pause','stop','seekbackward','seekforward','seekto','previoustrack','nexttrack']
      .forEach(action => {
        try { navigator.mediaSession.setActionHandler(action, null); } catch {}
      });
  } catch {}
}

async function _loadBackgroundBuffer() {
  if (_backgroundBuffer) return _backgroundBuffer;
  if (_backgroundBufferPromise) return _backgroundBufferPromise;
  if (!_ctx) return null;
  const url = SOUND_FILES['background-music'];
  if (!url) return null;
  _backgroundBufferPromise = (async () => {
    try {
      const response = await fetch(encodeURI(url));
      const arrayBuffer = await response.arrayBuffer();
      _backgroundBuffer = await _ctx.decodeAudioData(arrayBuffer);
      return _backgroundBuffer;
    } catch (error) {
      console.warn('Failed to load background music', error);
      return null;
    } finally {
      _backgroundBufferPromise = null;
    }
  })();
  return _backgroundBufferPromise;
}

function _createEngineAudio() {
  if (_engineAudio) return;
  const url = SOUND_FILES['engine-sound'];
  if (!url) return;
  _engineAudio = new Audio(encodeURI(url));
  _engineAudio.loop = true;
  _engineAudio.preload = 'auto';
  _engineAudio.volume = Math.min(0.35, 0.16 * _volume);
  _engineAudio.muted = _muted;
}

// تحميل ملف صوتي واحد
async function _loadSound(key) {
  if (_loadedSounds.has(key)) return _loadedSounds.get(key);
  
  const url = SOUND_FILES[key];
  if (!url || key === 'background-music') return null;
  
  try {
    const response = await fetch(encodeURI(url));
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await _ctx.decodeAudioData(arrayBuffer);
    _loadedSounds.set(key, audioBuffer);
    return audioBuffer;
  } catch (error) {
    console.warn(`Failed to load sound: ${key}`, error);
    return null;
  }
}

// تحميل جميع الملفات الصوتية
export async function loadAllSounds() {
  if (!_ctx) return;

  const promises = Object.keys(SOUND_FILES)
    .filter(key => key !== 'background-music')
    .map(key => _loadSound(key));
  await Promise.all(promises);
  // موسيقى الخلفية تُحمَّل lazy عند أول startAmbient (لتجنب تحميل ملف ضخم وقت الإقلاع)
  console.log('All sounds loaded');
}

function _playBuffer(buffer, volumeMultiplier = 1) {
  const source = _ctx.createBufferSource();
  source.buffer = buffer;

  const gain = _ctx.createGain();
  gain.gain.setValueAtTime(Math.min(0.3, volumeMultiplier * _volume), _ctx.currentTime);

  source.connect(gain);
  gain.connect(_ctx.destination);

  source.start();
}

// تشغيل صوت من ملف
function _playSoundFile(key, volumeMultiplier = 1) {
  if (!_shouldPlaySounds()) return;
  
  const buffer = _loadedSounds.get(key);
  if (buffer) {
    _playBuffer(buffer, volumeMultiplier);
    return;
  }

  _loadSound(key).then((loaded) => {
    if (loaded && _shouldPlaySounds()) {
      _playBuffer(loaded, volumeMultiplier);
    }
  });
}

function _applySettingsFromState() {
  const settings = getSettings();
  _muted = Boolean(settings.muted);
  _musicEnabled = settings.musicEnabled !== false;
  _volume = typeof settings.volume === 'number'
    ? Math.min(1, Math.max(0, settings.volume))
    : DEFAULT_SETTINGS.volume;
}

function _saveSettings(updates) {
  const next = setSettings(updates);
  _applySettingsFromState();
  return next;
}

function _updateActiveGainLevels() {
  if (!_ctx) return;
  if (_ambientGain) {
    _ambientGain.gain.setValueAtTime(Math.min(0.35, 0.18 * _volume), _ctx.currentTime);
  }
  if (_engineGain) {
    _engineGain.gain.setValueAtTime(Math.min(0.35, 0.16 * _volume), _ctx.currentTime);
  }
}

function _syncSettings() {
  const prevMuted = _muted;
  const prevMusic = _musicEnabled;
  _applySettingsFromState();

  if (_muted) {
    stopAmbient();
    stopEngine();
    return;
  }

  if (_musicEnabled && !prevMusic) {
    startAmbient();
  }
  if (!_musicEnabled) {
    stopAmbient();
  }

  _updateActiveGainLevels();
}

function _attachSettingsListener() {
  if (_settingsUnsub) return;
  _settingsUnsub = subscribeState('settings', _syncSettings);
}

function _createContext() {
  if (_ctx) return _ctx;
  try {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (error) {
    console.warn('Web Audio API not supported', error);
    _ctx = null;
    return null;
  }

  if (_ctx.state === 'suspended') {
    _attachResumeListener();
  }

  return _ctx;
}

function _attachResumeListener() {
  if (_resumeListenerAttached || !_ctx) return;
  _resumeListenerAttached = true;

  const resumeAudio = () => {
    if (!_ctx) return;
    _ctx.resume()
      .then(() => {
        if (_musicEnabled && !_muted) {
          startAmbient();
        }
      })
      .catch(() => {});
    document.removeEventListener('click', resumeAudio);
    document.removeEventListener('keydown', resumeAudio);
    document.removeEventListener('touchstart', resumeAudio);
  };

  document.addEventListener('click', resumeAudio, { once: true, passive: true });
  document.addEventListener('keydown', resumeAudio, { once: true, passive: true });
  document.addEventListener('touchstart', resumeAudio, { once: true, passive: true });
}

function _shouldPlaySounds() {
  return !_muted && _createContext();
}

function _createSfxGain(ctx, peak = 0.2) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(Math.min(0.3, peak * _volume), ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
  return gain;
}

export function initAudio() {
  _applySettingsFromState();
  _attachSettingsListener();
  _createContext();
  _suppressMediaSession();
  loadAllSounds(); // تحميل جميع الملفات الصوتية
}

export function isMuted() {
  return _muted;
}

export function isMusicEnabled() {
  return _musicEnabled;
}

export function getVolume() {
  return _volume;
}

export function toggleMute() {
  return setMuted(!_muted);
}

export function setMuted(value) {
  _saveSettings({ muted: Boolean(value) });
  if (_muted) {
    stopAmbient();
    stopEngine();
  } else if (_musicEnabled) {
    startAmbient();
  }
  return _muted;
}

export function toggleMusicEnabled() {
  return setMusicEnabled(!_musicEnabled);
}

export function setMusicEnabled(value) {
  _saveSettings({ musicEnabled: Boolean(value) });
  if (_musicEnabled && !_muted) {
    startAmbient();
  } else {
    stopAmbient();
  }
  return _musicEnabled;
}

export function setVolume(value) {
  const volume = Math.min(1, Math.max(0, Number(value)));
  _saveSettings({ volume });
  if (_backgroundGain && _ctx) {
    _backgroundGain.gain.setValueAtTime(Math.min(0.3, 0.04 * volume), _ctx.currentTime);
  }
  if (_engineAudio) {
    _engineAudio.volume = Math.min(0.35, 0.16 * volume);
  }
  if (_ambientGain && _ctx) {
    _ambientGain.gain.setValueAtTime(Math.min(0.35, 0.18 * volume), _ctx.currentTime);
  }
  if (_engineGain && _ctx) {
    _engineGain.gain.setValueAtTime(Math.min(0.35, 0.16 * volume), _ctx.currentTime);
  }
  return _volume;
}

export function playCollectSound() {
  _playSoundFile('letter-collecting', 0.8);
}

export function playLoseLifeSound() {
  _playSoundFile('heart-loosing', 0.9);
}

export function playShotSound() {
  _playSoundFile('shot', 1.0);
}

export function playSplashSound() {
  _playSoundFile('gathering-fishes', 0.8);
}

export function playWinSound() {
  _playSoundFile('win', 1.0);
}

export function playHitSound() {
  _playSoundFile('hit', 0.9);
}

export function playMissSound() {
  _playSoundFile('miss-hit', 0.8);
}

export function playLooseSound() {
  _playSoundFile('loose', 0.9);
}

export function playScopeOnSound() {
  _playSoundFile('scope-on', 0.7);
}

export function playFishingNetThrewSound() {
  _playSoundFile('fishing-net-threw', 0.8);
}

export function playCrashSound() {
  _playSoundFile('crash', 1.0);
}

export function playEngineSound() {
  _playSoundFile('engine-sound', 0.6);
}

export function playLetterGatheringTaxiSound() {
  _playSoundFile('letter-gathering-taxi', 0.8);
}

export function playJackpotSound() {
  _playSoundFile('jackpot', 1.0);
}

export function playLooseCasinoSound() {
  _playSoundFile('loose-casino', 0.9);
}

export function playSpiningSound() {
  _playSoundFile('spining', 0.7);
}

export function playStopSound() {
  _playSoundFile('stop', 0.8);
}

export function playGameOverSound() {
  _playSoundFile('game-over', 0.9);
}

export function playIceFreezSound() {
  _playSoundFile('ice-freez', 0.8);
}

export function playLetterGatheringRainSound() {
  _playSoundFile('letter-gathering-rain', 0.8);
}

export function playRainSound() {
  _playSoundFile('rain-sound', 0.5);
}

export function playAchievementSound() {
  _playSoundFile('achievement', 1.0);
}

export function playNotificationSound() {
  _playSoundFile('notification', 0.8);
}

export function playPageOpeningSound() {
  _playSoundFile('page-opening', 0.7);
}

export function playStartGameSound() {
  _playSoundFile('start-game', 0.9);
}

export function playMuseumWordsOpeningSound() {
  _playSoundFile('museum-words-opening', 0.8);
}

export function playKeySfxSound() {
  _playSoundFile('key-sfx', 0.6);
}

export async function startAmbient() {
  if (_muted || !_musicEnabled) return;
  if (!_ctx) return;
  if (_backgroundSource) return; // already playing

  const buffer = await _loadBackgroundBuffer();
  if (!buffer) return;
  if (_muted || !_musicEnabled) return; // re-check بعد await
  if (_backgroundSource) return;

  _backgroundSource = _ctx.createBufferSource();
  _backgroundSource.buffer = buffer;
  _backgroundSource.loop = true;

  _backgroundGain = _ctx.createGain();
  _backgroundGain.gain.setValueAtTime(Math.min(0.3, 0.04 * _volume), _ctx.currentTime);

  _backgroundSource.connect(_backgroundGain);
  _backgroundGain.connect(_ctx.destination);

  _backgroundSource.onended = () => {
    _backgroundSource = null;
    _backgroundGain = null;
  };

  try {
    _backgroundSource.start();
  } catch {
    _backgroundSource = null;
    _backgroundGain = null;
  }
}

export function stopAmbient() {
  if (_backgroundSource) {
    try { _backgroundSource.stop(); } catch {}
    _backgroundSource = null;
    _backgroundGain = null;
  }
}

export function startEngine() {
  if (_muted) return;
  _createEngineAudio();

  if (_engineAudio) {
    _engineAudio.volume = Math.min(0.3, 0.08 * _volume);
    _engineAudio.muted = _muted;
    _engineAudio.play().catch(() => {});
  }
}

export function stopEngine() {
  if (_engineAudio) {
    try {
      _engineAudio.pause();
      _engineAudio.currentTime = 0;
    } catch {}
  }
}
