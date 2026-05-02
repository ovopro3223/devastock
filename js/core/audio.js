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
    _ambientGain.gain.setValueAtTime(Math.min(0.3, 0.04 * _volume), _ctx.currentTime);
  }
  if (_engineGain) {
    _engineGain.gain.setValueAtTime(Math.min(0.18, 0.04 * _volume), _ctx.currentTime);
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
  if (_ambientGain && _ctx) {
    _ambientGain.gain.setValueAtTime(Math.min(0.3, 0.04 * volume), _ctx.currentTime);
  }
  if (_engineGain && _ctx) {
    _engineGain.gain.setValueAtTime(Math.min(0.18, 0.04 * volume), _ctx.currentTime);
  }
  return _volume;
}

export function playCollectSound() {
  if (!_shouldPlaySounds()) return;
  const ctx = _ctx;
  const osc = ctx.createOscillator();
  const gain = _createSfxGain(ctx, 0.16);
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);

  osc.start();
  osc.stop(ctx.currentTime + 0.2);
}

export function playLoseLifeSound() {
  if (!_shouldPlaySounds()) return;
  const ctx = _ctx;
  const osc = ctx.createOscillator();
  const gain = _createSfxGain(ctx, 0.18);
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.3);

  gain.gain.setValueAtTime(Math.min(0.3, 0.2 * _volume), ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

  osc.start();
  osc.stop(ctx.currentTime + 0.3);
}

export function playShotSound() {
  if (!_shouldPlaySounds()) return;
  const ctx = _ctx;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const gain = ctx.createGain();
  noise.connect(gain);
  gain.connect(ctx.destination);

  gain.gain.setValueAtTime(Math.min(0.3, 0.25 * _volume), ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

  noise.start();
}

export function playSplashSound() {
  if (!_shouldPlaySounds()) return;
  const ctx = _ctx;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.45;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;

  const gain = ctx.createGain();
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  gain.gain.setValueAtTime(Math.min(0.3, 0.2 * _volume), ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

  noise.start();
}

export function playWinSound() {
  if (!_shouldPlaySounds()) return;
  const ctx = _ctx;
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);

    gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.1);
    gain.gain.linearRampToValueAtTime(Math.min(0.3, 0.15 * _volume), ctx.currentTime + i * 0.1 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.3);

    osc.start(ctx.currentTime + i * 0.1);
    osc.stop(ctx.currentTime + i * 0.1 + 0.3);
  });
}

export function startAmbient() {
  if (_muted || !_musicEnabled) return;
  const ctx = _createContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    _attachResumeListener();
    return;
  }

  stopAmbient();

  _ambientOsc = ctx.createOscillator();
  _ambientGain = ctx.createGain();

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;

  _ambientOsc.connect(filter);
  filter.connect(_ambientGain);
  _ambientGain.connect(ctx.destination);

  _ambientOsc.type = 'sine';
  _ambientOsc.frequency.setValueAtTime(110, ctx.currentTime);

  _ambientGain.gain.setValueAtTime(0, ctx.currentTime);
  _ambientGain.gain.linearRampToValueAtTime(Math.min(0.08, 0.04 * _volume), ctx.currentTime + 1.5);

  _ambientOsc.start();

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 5;
  lfo.frequency.value = 0.3;
  lfo.connect(lfoGain);
  lfoGain.connect(_ambientOsc.frequency);
  lfo.start();
}

export function stopAmbient() {
  if (_ambientGain && _ctx) {
    try {
      _ambientGain.gain.linearRampToValueAtTime(0, _ctx.currentTime + 0.5);
      const oscRef = _ambientOsc;
      setTimeout(() => {
        try { oscRef && oscRef.stop(); } catch {}
      }, 600);
    } catch {}
  }
  _ambientGain = null;
  _ambientOsc = null;
}

export function startEngine() {
  if (_muted) return;
  const ctx = _createContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    _attachResumeListener();
    return;
  }

  stopEngine();
  _engineOsc = ctx.createOscillator();
  _engineGain = ctx.createGain();

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;

  _engineOsc.connect(filter);
  filter.connect(_engineGain);
  _engineGain.connect(ctx.destination);

  _engineOsc.type = 'sawtooth';
  _engineOsc.frequency.setValueAtTime(60, ctx.currentTime);

  _engineGain.gain.setValueAtTime(0, ctx.currentTime);
  _engineGain.gain.linearRampToValueAtTime(Math.min(0.1, 0.04 * _volume), ctx.currentTime + 0.3);

  _engineOsc.start();

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 8;
  lfo.frequency.value = 4;
  lfo.connect(lfoGain);
  lfoGain.connect(_engineOsc.frequency);
  lfo.start();
}

export function stopEngine() {
  if (_engineGain && _ctx) {
    try {
      _engineGain.gain.linearRampToValueAtTime(0, _ctx.currentTime + 0.3);
      const oscRef = _engineOsc;
      setTimeout(() => {
        try { oscRef && oscRef.stop(); } catch {}
      }, 400);
    } catch {}
  }
  _engineGain = null;
  _engineOsc = null;
}
