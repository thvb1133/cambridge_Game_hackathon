import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SHAPES, path } from './shapes.js';
import {
  SketchError,
  describeSketch,
  footprintRadius,
  readSketch,
  structureHeight,
} from '../src/core/sketch.js';

test('each archetype reads back off the pad', () => {
  const labels = Object.fromEntries(
    Object.entries(SHAPES).map(([name, strokes]) => [name, readSketch(strokes).label]),
  );
  assert.deepEqual(labels, {
    mountain: 'mountain',
    house: 'house',
    tower: 'tower',
    pagoda: 'tower', // a pagoda is a spire that steps
    dome: 'dome',
    squiggle: 'sigil',
  });
});

test('shape chooses the element, not a dice roll', () => {
  assert.equal(readSketch(SHAPES.mountain).element, 'earth');
  assert.equal(readSketch(SHAPES.house).element, 'wood');
  assert.equal(readSketch(SHAPES.tower).element, 'metal');
  assert.equal(readSketch(SHAPES.dome).element, 'water');
  assert.equal(readSketch(SHAPES.squiggle).element, 'fire');
});

test('the same drawing builds the same thing at any size or position', () => {
  const shifted = SHAPES.house.map((stroke) =>
    stroke.map((p) => ({ x: p.x * 3.5 + 420, y: p.y * 3.5 - 90 })),
  );
  const a = readSketch(SHAPES.house);
  const b = readSketch(shifted);
  assert.equal(a.label, b.label);
  a.bands.forEach((band, i) => {
    assert.ok(
      Math.abs(band.halfWidth - b.bands[i].halfWidth) < 0.02,
      `band ${i} drifted: ${band.halfWidth} vs ${b.bands[i].halfWidth}`,
    );
  });
});

test('the silhouette, not an archetype, is what gets extruded', () => {
  const tower = readSketch(SHAPES.tower);
  const mountain = readSketch(SHAPES.mountain);
  // A tower keeps its width all the way up; a mountain sheds it.
  assert.ok(tower.bands.at(-1).halfWidth > tower.bands[0].halfWidth * 0.8);
  assert.ok(mountain.bands.at(-1).halfWidth < mountain.bands[0].halfWidth * 0.3);
  // Drawings are normalised by their longer side, so what carries into the
  // world is slenderness rather than how much of the pad you filled.
  const slenderness = (spec) => structureHeight(spec) / footprintRadius(spec);
  assert.ok(slenderness(tower) > slenderness(mountain) * 2);
});

test('a gap in the ink does not punch a hole through the model', () => {
  // Two roof lines with nothing drawn between them: the band in the gap has
  // to borrow a width rather than collapse to zero.
  const gapped = [
    path([{ x: 0, y: 100 }, { x: 0, y: 60 }]),
    path([{ x: 60, y: 100 }, { x: 60, y: 60 }]),
    path([{ x: 0, y: 20 }, { x: 30, y: 0 }, { x: 60, y: 20 }]),
  ];
  const spec = readSketch(gapped);
  for (const band of spec.bands) assert.ok(band.halfWidth > 0, 'band collapsed');
});

test('bigger drawings make sturdier buildings', () => {
  const wide = readSketch(SHAPES.mountain);
  const thin = readSketch(SHAPES.tower);
  assert.ok(wide.hp > thin.hp);
  assert.ok(footprintRadius(wide, 3) > footprintRadius(thin, 3));
});

test('an empty or degenerate pad is refused, not guessed at', () => {
  assert.throws(() => readSketch([]), SketchError);
  assert.throws(() => readSketch([[{ x: 1, y: 1 }]]), SketchError);
  assert.throws(() => readSketch([[{ x: 5, y: 5 }, { x: 5, y: 5 }]]), SketchError);
});

test('structures describe themselves in words the companion can say', () => {
  assert.equal(describeSketch(readSketch(SHAPES.mountain)), 'great mountain');
  assert.match(describeSketch(readSketch(SHAPES.tower)), /tower$/);
});
