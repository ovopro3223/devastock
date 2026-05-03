// ===== منطق صفحة الأنماط =====
import { getGameProgression } from '../core/game-progression.js';

const MODE_CONFIG = {
  'letter-rain':  { path: '../modes/letter-rain/game.js',  className: 'LetterRainGame',  method: 'start', hasExit: true },
  'letter-blaze': { path: '../modes/letter-blaze/game.js', className: 'LetterBlazeGame', method: 'start', hasExit: true },
  casino:        { path: '../modes/casino/game.js',      className: 'CasinoGame',      method: 'open',  hasExit: false },
  taxi:          { path: '../modes/taxi/game.js',        className: 'TaxiGame',        method: 'start', hasExit: true },
  fishing:       { path: '../modes/fishing/game.js',     className: 'FishingGame',     method: 'start', hasExit: true },
  sniper:        { path: '../modes/sniper/game.js',      className: 'SniperGame',      method: 'start', hasExit: true },
};

const instances = {};

async function loadMode(mode, navigate) {
  const config = MODE_CONFIG[mode];
  if (!config) {
    throw new Error(`Unknown mode: ${mode}`);
  }

  if (instances[mode]) {
    return instances[mode];
  }

  const module = await import(config.path);
  const GameClass = module[config.className];
  if (!GameClass) {
    throw new Error(`Unable to load ${config.className} from ${config.path}`);
  }

  instances[mode] = config.hasExit
    ? new GameClass(() => navigate('menu'))
    : new GameClass();

  return instances[mode];
}

export function initModes(navigate) {
  Object.keys(MODE_CONFIG).forEach((mode) => {
    const button = document.getElementById(`card-${mode}`);
    if (!button) return;

    button.addEventListener('click', async () => {
      try {
        const instance = await loadMode(mode, navigate);
        navigate(mode);
        requestAnimationFrame(() => {
          if (typeof instance[MODE_CONFIG[mode].method] === 'function') {
            instance[MODE_CONFIG[mode].method]();
          }
        });
      } catch (error) {
        console.error('فشل تحميل النمط:', mode, error);
      }
    });
  });

  document.addEventListener('page-show', (e) => {
    if (e.detail === 'modes') renderModesProgression();
  });
}

export function renderModesProgression() {
  Object.keys(MODE_CONFIG).forEach((mode) => {
    const card = document.getElementById(`card-${mode}`);
    if (!card) return;
    const prog = getGameProgression(mode);

    let badge = card.querySelector('.mode-progression-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'mode-progression-badge';
      card.appendChild(badge);
    }

    const multLabel = prog.multiplier > 1 ? `<span class="mode-mult">x${prog.multiplier.toFixed(2).replace(/\.00$/, '')}</span>` : '';
    badge.innerHTML = `
      <div class="mode-prog-row">
        <span class="mode-prog-level">Lv ${prog.level}</span>
        ${multLabel}
      </div>
      <div class="mode-prog-bar"><div class="mode-prog-fill" style="width:${prog.percent}%"></div></div>
      ${prog.nextPerk ? `<div class="mode-prog-next">Lv ${prog.nextPerk.level}: ${prog.nextPerk.description}</div>` : ''}
    `;
  });
}
