// ===== منطق صفحة الأنماط =====
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
}
