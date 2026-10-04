// The scale ladder. A match walks up this list; the same five elements are
// re-skinned at every rung, which is what makes "atom to multiverse" one
// mechanic instead of eleven unrelated levels.
//
// `metres` is the radius of the arena in real-world units and is only used for
// the HUD readout and for the logarithmic camera dolly during a transition.

export const SCALES = [
  {
    id: 'atom',
    title: 'Atom',
    subtitle: 'electron shell',
    metres: 1e-10,
    palette: { fog: 0x05030f, floor: 0x1b1040, accent: 0x9b7bff },
    // How each element reads at this scale, shown in the codex panel.
    reading: {
      fire: 'plasma',
      water: 'electron sea',
      wood: 'covalent bond',
      metal: 'lattice',
      earth: 'nucleus',
    },
    hazard: 'decay',
    motes: 420,
  },
  {
    id: 'molecule',
    title: 'Molecule',
    subtitle: 'bond',
    metres: 1e-9,
    palette: { fog: 0x071018, floor: 0x123044, accent: 0x7ee0ff },
    reading: {
      fire: 'spark',
      water: 'solvent',
      wood: 'chain',
      metal: 'bond',
      earth: 'cluster',
    },
    hazard: 'reaction',
    motes: 380,
  },
  {
    id: 'dna',
    title: 'DNA',
    subtitle: 'double helix',
    metres: 2e-9,
    palette: { fog: 0x02100f, floor: 0x0d3b33, accent: 0x49ffd0 },
    reading: {
      fire: 'mutation',
      water: 'solvent',
      wood: 'base pair',
      metal: 'enzyme',
      earth: 'histone',
    },
    hazard: 'transcription error',
    motes: 360,
  },
  {
    id: 'cell',
    title: 'Cell',
    subtitle: 'cytoplasm',
    metres: 2e-5,
    palette: { fog: 0x100418, floor: 0x3a1050, accent: 0xff7bd5 },
    reading: {
      fire: 'inflammation',
      water: 'cytosol',
      wood: 'growth',
      metal: 'membrane pump',
      earth: 'organelle',
    },
    hazard: 'apoptosis',
    motes: 300,
  },
  {
    id: 'cellulose',
    title: 'Cellulose',
    subtitle: 'fiber wall',
    metres: 5e-4,
    palette: { fog: 0x07140a, floor: 0x1a3a18, accent: 0xb6ff6a },
    reading: {
      fire: 'kiln',
      water: 'pulp',
      wood: 'fiber',
      metal: 'press',
      earth: 'lignin',
    },
    hazard: 'shear',
    motes: 280,
  },
  {
    id: 'creature',
    title: 'Creature',
    subtitle: 'ghost-realm beast',
    metres: 3,
    palette: { fog: 0x140606, floor: 0x4a1414, accent: 0xff9c5c },
    reading: {
      fire: 'fever',
      water: 'blood',
      wood: 'sinew',
      metal: 'claw',
      earth: 'bone',
    },
    hazard: 'frenzy',
    motes: 240,
  },
  {
    id: 'city',
    title: 'City',
    subtitle: 'spirit market',
    metres: 4e3,
    palette: { fog: 0x060a16, floor: 0x14224a, accent: 0xffd166 },
    reading: {
      fire: 'riot',
      water: 'canal',
      wood: 'district',
      metal: 'rail',
      earth: 'wall',
    },
    hazard: 'curfew',
    motes: 200,
  },
  {
    id: 'planet',
    title: 'Mars',
    subtitle: 'dust basin',
    metres: 3.39e6,
    palette: { fog: 0x1a0a04, floor: 0x5e2410, accent: 0xff7a45 },
    reading: {
      fire: 'volcano',
      water: 'ice cap',
      wood: 'terraform',
      metal: 'ore',
      earth: 'regolith',
    },
    hazard: 'dust storm',
    motes: 260,
  },
  {
    id: 'solar',
    title: 'Solar',
    subtitle: 'mars orbit',
    metres: 4.5e12,
    palette: { fog: 0x140802, floor: 0x3a1a08, accent: 0xffb020 },
    reading: {
      fire: 'sun',
      water: 'ice moon',
      wood: 'life',
      metal: 'asteroid',
      earth: 'planet',
    },
    hazard: 'flare',
    motes: 520,
  },
  {
    id: 'galaxy',
    title: 'Milky Way',
    subtitle: 'orion arm',
    metres: 5e20,
    palette: { fog: 0x02030f, floor: 0x0a1038, accent: 0x7bb6ff },
    reading: {
      fire: 'star',
      water: 'nebula',
      wood: 'spiral arm',
      metal: 'heavy element',
      earth: 'rocky world',
    },
    hazard: 'supernova',
    motes: 900,
  },
  {
    id: 'multiverse',
    title: 'Multiverse',
    subtitle: 'the rift',
    metres: 1e30,
    palette: { fog: 0x000000, floor: 0x1a0a2e, accent: 0xffffff },
    reading: {
      fire: 'inflation',
      water: 'vacuum',
      wood: 'branch',
      metal: 'constant',
      earth: 'brane',
    },
    hazard: 'collapse',
    motes: 1200,
  },
];

export const SCALE_IDS = SCALES.map((s) => s.id);

export function scaleAt(index) {
  return SCALES[clampScaleIndex(index)];
}

export function clampScaleIndex(index) {
  if (!Number.isFinite(index)) return 0;
  return Math.min(SCALES.length - 1, Math.max(0, Math.round(index)));
}

export function scaleIndexById(id) {
  const index = SCALES.findIndex((s) => s.id === id);
  return index === -1 ? null : index;
}

// Readable "1 nm" / "3390 km" style label for the HUD.
export function formatMetres(metres) {
  const units = [
    [1e24, 'Ym'],
    [1e21, 'Zm'],
    [1e18, 'Em'],
    [1e15, 'Pm'],
    [1e12, 'Tm'],
    [1e9, 'Gm'],
    [1e6, 'Mm'],
    [1e3, 'km'],
    [1, 'm'],
    [1e-3, 'mm'],
    [1e-6, 'µm'],
    [1e-9, 'nm'],
    [1e-12, 'pm'],
  ];
  for (const [factor, suffix] of units) {
    if (metres >= factor) {
      const value = metres / factor;
      return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${suffix}`;
    }
  }
  return `${(metres / 1e-15).toFixed(1)} fm`;
}
