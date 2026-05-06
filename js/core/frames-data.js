// ===== بيانات الإطارات =====
export const FRAMES_PATH = 'assets/frames/';

export const FRAMES = [
  // Free (level requirement)
  { id: 'nasij',    name: 'ناسج',     file: 'frame-nasij.png',    cost: 0,     levelReq: 5,  rarity: 'free'    },

  // Common (10K each)
  { id: 'blue',     name: 'الأزرق',   file: 'frame-blue.png',     cost: 10000, levelReq: 0,  rarity: 'common'  },
  { id: 'floral',   name: 'الزهري',   file: 'frame-floral.png',   cost: 10000, levelReq: 0,  rarity: 'common'  },
  { id: 'islamic',  name: 'الإسلامي', file: 'frame-islamic.png',  cost: 10000, levelReq: 0,  rarity: 'common'  },
  { id: 'roses',    name: 'الورود',   file: 'frame-roses.png',    cost: 10000, levelReq: 0,  rarity: 'common'  },
  { id: 'tropical', name: 'الاستوائي',file: 'frame-tropical.png', cost: 10000, levelReq: 0,  rarity: 'common'  },
  { id: 'magical',  name: 'الساحر',   file: 'frame-magical.png',  cost: 10000, levelReq: 0,  rarity: 'common'  },
  { id: 'fire',     name: 'الناري',   file: 'frame-fire.png',     cost: 10000, levelReq: 0,  rarity: 'common'  },

  // Epic (50K each)
  { id: 'royal',    name: 'الملكي',   file: 'frame-royal.png',    cost: 50000, levelReq: 0,  rarity: 'epic'    },
  { id: 'mythic',   name: 'الملحمي',  file: 'frame-mythic.png',   cost: 50000, levelReq: 0,  rarity: 'epic'    },
];

export const RARITY_INFO = {
  free:   { label: 'مجاني',   color: '#5DD3D3' },
  common: { label: 'عادي',    color: '#A0A0B0' },
  epic:   { label: 'ملحمي',   color: '#FF6B9D' },
};

export function getFrameById(id) {
  return FRAMES.find(f => f.id === id) || null;
}

export function getFrameUrl(frame) {
  if (!frame) return '';
  return FRAMES_PATH + frame.file;
}
