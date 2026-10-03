// Named fusions of two wuxing elements. Lightning is not a sixth element —
// a spark is metal carrying fire — so plasma still resolves through 相克.
// Wind is read as wood for the same reason: the cycle stays intact.

export const COMPOUNDS = {
  plasma: { a: 'fire', b: 'metal', strike: 'fire', words: ['plasma', 'lightning'] },
  storm: { a: 'water', b: 'wood', strike: 'water', words: ['storm', 'wind'] },
  magma: { a: 'fire', b: 'earth', strike: 'earth', words: ['magma', 'lava'] },
  wildfire: { a: 'wood', b: 'fire', strike: 'fire', words: ['wildfire'] },
  tide: { a: 'water', b: 'earth', strike: 'water', words: ['tidepool'] },
};

export const COMPOUND_NAMES = Object.keys(COMPOUNDS);

export function compoundFor(elements) {
  const set = new Set(elements);
  if (set.size < 2) return null;
  for (const [name, spec] of Object.entries(COMPOUNDS)) {
    if (set.has(spec.a) && set.has(spec.b)) return name;
  }
  return null;
}
