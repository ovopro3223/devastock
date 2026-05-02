// ===== دوال مساعدة عامة =====

// رقم عشوائي بين min و max
export function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

// عنصر عشوائي من مصفوفة
export function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// اختبار التصادم: دائري للأحرف (فقاعة) ومربع لباقي الكيانات
export function hitTest(px, py, entity) {
  if (entity.type === 'letter') {
    const r  = entity.size * 0.66;
    const dx = px - entity.x;
    const dy = py - entity.y;
    return dx * dx + dy * dy <= r * r;
  }
  const half = entity.size / 2;
  return (
    px >= entity.x - half &&
    px <= entity.x + half &&
    py >= entity.y - half &&
    py <= entity.y + half
  );
}
