// ===== أحرف عربية متساقطة كخلفية للصفحات =====
const LETTERS = [
  'ا','ب','ت','ث','ج','ح','خ',
  'د','ذ','ر','ز','س','ش','ص',
  'ض','ط','ظ','ع','غ','ف','ق',
  'ك','ل','م','ن','ه','و','ي',
];

function rnd(a, b) { return a + Math.random() * (b - a); }
function rndChar()  { return LETTERS[Math.floor(Math.random() * LETTERS.length)]; }

function makeDrop(w, h, anywhere = false) {
  const size = rnd(14, 38);
  return {
    x:     rnd(12, w - 12),
    y:     anywhere ? rnd(-40, h) : rnd(-220, -10),
    speed: rnd(0.55, 1.7),
    char:  rndChar(),
    size,
    alpha: rnd(0.05, 0.13),
  };
}

export function startBgRain(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0;

  function resize() {
    w = canvas.width  = canvas.offsetWidth  || window.innerWidth;
    h = canvas.height = canvas.offsetHeight || window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const N     = 42;
  const drops = Array.from({ length: N }, () => makeDrop(w, h, true));

  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (const d of drops) {
      d.y += d.speed;
      if (d.y > h + 50) Object.assign(d, makeDrop(w, h, false));

      ctx.save();
      ctx.globalAlpha  = d.alpha;
      ctx.shadowColor  = 'rgba(255,215,0,0.45)';
      ctx.shadowBlur   = 7;
      ctx.font         = `bold ${d.size}px Cairo, sans-serif`;
      ctx.fillStyle    = '#FFD700';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.char, d.x, d.y);
      ctx.restore();
    }
    requestAnimationFrame(draw);
  }
  draw();
}
