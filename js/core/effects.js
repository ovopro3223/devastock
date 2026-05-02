export function screenShake(element, amplitude = 10, duration = 220) {
  if (!element) return;
  const original = element.style.transform || '';
  const start = performance.now();

  function tick(now) {
    const elapsed = now - start;
    if (elapsed < duration) {
      const x = (Math.random() - 0.5) * amplitude;
      const y = (Math.random() - 0.5) * amplitude;
      element.style.transform = `translate(${x}px, ${y}px) ${original}`;
      requestAnimationFrame(tick);
    } else {
      element.style.transform = original;
    }
  }

  requestAnimationFrame(tick);
}

export function burstParticles(container, x, y, color = '#FFD700', count = 10) {
  if (!container) return;
  const root = container.closest('.page') || container;
  const wrapper = document.createElement('div');
  wrapper.className = 'particle-burst';
  wrapper.style.left = `${x}px`;
  wrapper.style.top = `${y}px`;

  for (let i = 0; i < count; i += 1) {
    const particle = document.createElement('span');
    particle.className = 'particle-dot';
    particle.style.background = color;
    particle.style.setProperty('--dx', `${(Math.random() - 0.5) * 80}px`);
    particle.style.setProperty('--dy', `${(Math.random() - 0.5) * 80}px`);
    wrapper.appendChild(particle);
  }

  root.appendChild(wrapper);
  setTimeout(() => wrapper.remove(), 620);
}
