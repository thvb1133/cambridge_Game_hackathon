// Wuxing (五行). Each element overcomes the next in the KE cycle and feeds the
// next in the SHENG cycle. Both cycles are used: overcoming sets damage
// multipliers, generating sets how fast a caster regenerates qi near an ally.

export const ELEMENTS = ['metal', 'wood', 'water', 'fire', 'earth'];

export const GLYPH = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
};

export const COLOR = {
  metal: 0xe8e4d9,
  wood: 0x4fd47a,
  water: 0x3fa9f5,
  fire: 0xff6a3d,
  earth: 0xc99a53,
};

// 相克 — overcoming.
const OVERCOMES = {
  metal: 'wood',
  wood: 'earth',
  earth: 'water',
  water: 'fire',
  fire: 'metal',
};

// 相生 — generating.
const GENERATES = {
  wood: 'fire',
  fire: 'earth',
  earth: 'metal',
  metal: 'water',
  water: 'wood',
};

export const STRONG_MULTIPLIER = 1.5;
export const WEAK_MULTIPLIER = 0.6;

export function overcomes(attacker, defender) {
  return OVERCOMES[attacker] === defender;
}

export function generates(source, target) {
  return GENERATES[source] === target;
}

export function damageMultiplier(attacker, defender) {
  if (overcomes(attacker, defender)) return STRONG_MULTIPLIER;
  if (overcomes(defender, attacker)) return WEAK_MULTIPLIER;
  return 1;
}

export function isElement(value) {
  return ELEMENTS.includes(value);
}
