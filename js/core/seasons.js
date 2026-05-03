// ===== نظام المواسم (Seasonal Ranked) =====
import { getState, setState } from './app-state.js';

// كل موسم = شهر تقويمي
export function getCurrentSeasonId(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-S${m}`;
}

export function getSeasonLabel(seasonId = getCurrentSeasonId()) {
  const m = parseInt(seasonId.slice(-2), 10);
  const months = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return months[m] || seasonId;
}

export function msUntilSeasonEnd(date = new Date()) {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
  return next - date;
}

// ===== Tiers =====
// كل tier له min/max نقاط الموسم + emoji + label + لون
export const TIERS = [
  { id: 'bronze',   label: 'برونزي',   emoji: '🥉', color: '#CD7F32', min: 0,     max: 499 },
  { id: 'silver',   label: 'فضي',      emoji: '🥈', color: '#C0C0C0', min: 500,   max: 1999 },
  { id: 'gold',     label: 'ذهبي',     emoji: '🥇', color: '#FFD700', min: 2000,  max: 4999 },
  { id: 'platinum', label: 'بلاتيني',  emoji: '💠', color: '#5DD3D3', min: 5000,  max: 9999 },
  { id: 'diamond',  label: 'ماسي',     emoji: '💎', color: '#B9F2FF', min: 10000, max: 19999 },
  { id: 'master',   label: 'أسطوري',   emoji: '👑', color: '#FF6B9D', min: 20000, max: Infinity },
];

export function getTier(seasonScore) {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (seasonScore >= TIERS[i].min) return TIERS[i];
  }
  return TIERS[0];
}

export function getTierProgress(seasonScore) {
  const tier = getTier(seasonScore);
  if (tier.max === Infinity) {
    return { tier, percent: 100, current: seasonScore, target: seasonScore, nextTier: null };
  }
  const span = tier.max - tier.min + 1;
  const inTier = seasonScore - tier.min;
  const nextTier = TIERS[TIERS.indexOf(tier) + 1] || null;
  return {
    tier,
    nextTier,
    percent: Math.min(100, Math.floor((inTier / span) * 100)),
    current: seasonScore,
    target: tier.max + 1,
  };
}

// ===== التخزين المحلي =====
function load() {
  return getState('season_v1', { seasonId: '', score: 0 });
}
function save(d) { setState('season_v1', d); }

function _ensureSeason() {
  const d = load();
  const current = getCurrentSeasonId();
  if (d.seasonId !== current) {
    d.seasonId = current;
    d.score = 0;
    save(d);
  }
  return d;
}

export function getSeasonScore() {
  return _ensureSeason().score;
}

export function addSeasonPoints(points) {
  if (!points || points <= 0) return;
  const d = _ensureSeason();
  d.score += Math.round(points);
  save(d);
}

export function getSeasonState() {
  const d = _ensureSeason();
  return {
    seasonId: d.seasonId,
    seasonLabel: getSeasonLabel(d.seasonId),
    score: d.score,
    ...getTierProgress(d.score),
    msUntilEnd: msUntilSeasonEnd(),
  };
}
