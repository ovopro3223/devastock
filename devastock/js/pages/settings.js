// ===== صفحة الإعدادات ⚙️ =====
import {
  initAudio,
  isMuted,
  isMusicEnabled,
  getVolume,
  setMuted,
  setMusicEnabled,
  setVolume,
  startAmbient,
  stopAmbient,
} from '../core/audio.js';

export function initSettings() {
  initAudio();

  const soundToggle = document.getElementById('settings-sound-toggle');
  const musicToggle = document.getElementById('settings-music-toggle');
  const volumeSlider = document.getElementById('settings-volume-range');
  const volumeValue = document.getElementById('settings-volume-value');

  if (soundToggle) {
    soundToggle.checked = !isMuted();
    soundToggle.addEventListener('change', () => {
      setMuted(!soundToggle.checked);
      if (!soundToggle.checked) {
        stopAmbient();
      } else if (musicToggle && musicToggle.checked) {
        startAmbient();
      }
    });
  }

  if (musicToggle) {
    musicToggle.checked = isMusicEnabled();
    musicToggle.addEventListener('change', () => {
      setMusicEnabled(musicToggle.checked);
      if (musicToggle.checked && !isMuted()) {
        startAmbient();
      } else {
        stopAmbient();
      }
    });
  }

  if (volumeSlider && volumeValue) {
    const currentVolume = Math.round(getVolume() * 100);
    volumeSlider.value = String(currentVolume);
    volumeValue.textContent = `${currentVolume}%`;

    volumeSlider.addEventListener('input', () => {
      const newVolume = Number(volumeSlider.value) / 100;
      setVolume(newVolume);
      volumeValue.textContent = `${Math.round(newVolume * 100)}%`;
    });
  }

  if (isMusicEnabled() && !isMuted()) {
    document.addEventListener('click', () => {
      startAmbient();
    }, { once: true, passive: true });
  }
}
