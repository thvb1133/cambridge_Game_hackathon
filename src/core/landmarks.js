// A ring of scenery around the fighter, rebuilt from the hero's position.
//
// Nothing here is stored geometry from a level file. Crossing into the next
// cell, or changing scale, produces a different set of props: helix at DNA,
// dunes on Mars, a five-figure crew where the view gets wide. The crew is an
// original silhouette, not a depiction of any real group.

const BASE_KIND = {
  atom: 'orbit',
  molecule: 'cluster',
  dna: 'helix',
  cell: 'vesicle',
  cellulose: 'fiber',
  creature: 'arch',
  city: 'ruin',
  planet: 'dune',
  solar: 'orbit',
  galaxy: 'spiral',
  multiverse: 'ring',
};

function hash(x, z) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

function kindFor(scaleId, h) {
  const wide = scaleId === 'city' || scaleId === 'galaxy' || scaleId === 'multiverse';
  if (wide && h % 5 === 0) return 'crew';
  return BASE_KIND[scaleId] ?? 'orbit';
}

// Props sit outside the fighting circle so they read as a world, not cover.
export function landmarksAround(scaleId, origin, { spacing = 9 } = {}) {
  const gx = Math.round((origin?.x ?? 0) / spacing);
  const gz = Math.round((origin?.z ?? 0) / spacing);
  const marks = [];

  for (let ix = -3; ix <= 3; ix += 1) {
    for (let iz = -3; iz <= 3; iz += 1) {
      const x = (gx + ix) * spacing;
      const z = (gz + iz) * spacing;
      const d = Math.hypot(x - (origin?.x ?? 0), z - (origin?.z ?? 0));
      if (d < 13 || d > 30) continue;
      const h = hash(gx + ix, gz + iz);
      marks.push({
        id: `${scaleId}:${gx + ix}:${gz + iz}`,
        x,
        z,
        kind: kindFor(scaleId, h),
        yaw: (h % 628) / 100,
        scale: 0.85 + (h % 40) / 100,
      });
    }
  }

  return marks;
}
