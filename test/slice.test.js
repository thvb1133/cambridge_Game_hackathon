import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aimFromIrises, screenToArena } from '../src/input/aim.js';
import { gestureFromCount } from '../src/input/hands.js';
import { companionReply } from '../src/core/dialogue.js';
import { landmarksAround } from '../src/core/landmarks.js';
import { Match } from '../src/core/match.js';
import { validateCall } from '../src/core/spellbook.js';

test('looking at one fighter selects that fighter', () => {
  const match = new Match();
  const [near, far] = match.enemies;
  near.position = { x: 1, z: 3 };
  far.position = { x: -8, z: -6 };
  match.setAim({ x: -8, z: -6 });
  match.cast('bolt', { element: 'fire', target: 'nearest' });
  assert.equal(match.projectiles[0].to, far.id);
});

test('fusion hits harder and still uses a wuxing element', () => {
  const match = new Match();
  const line = match.cast('fuse', { compound: 'plasma', target: 'nearest' });
  assert.equal(line.ok, true);
  assert.equal(match.projectiles[0].element, 'fire');
  assert.equal(match.projectiles[0].compound, 'plasma');
  assert.ok(match.projectiles[0].damage > 26);
});

test('a private line is remembered and never played as code', () => {
  const match = new Match();
  const hp = match.enemies.map((enemy) => enemy.hp);
  const line = match.cast('talk', { line: 'import os; system("rm")' });
  assert.equal(line.ok, true);
  assert.deepEqual(match.enemies.map((enemy) => enemy.hp), hp);
  assert.equal(match.projectiles.length, 0);
  assert.equal(validateCall('talk', { line: 'import os; system("rm")' }).args.line, 'import os systemrm');
  assert.match(line.effect, /dragon/);
  assert.match(companionReply('hello', { form: 'robot', scale: 'Mars' }), /robot/);
});

test('saying mars moves the arena to the dust basin', () => {
  const match = new Match();
  match.qi = 100;
  const line = match.cast('ascend', { steps: 1, to: 'planet' });
  assert.equal(line.ok, true);
  assert.equal(match.scale.id, 'planet');
  assert.match(line.effect, /Mars/);
});

test('the world outside the arena changes as you move and as you change scale', () => {
  const here = landmarksAround('planet', { x: 0, z: 0 });
  const again = landmarksAround('planet', { x: 0, z: 0 });
  assert.deepEqual(here, again);
  assert.ok(here.length > 0);
  assert.ok(here.every((mark) => mark.kind === 'dune' || mark.kind === 'crew'));
  const there = landmarksAround('planet', { x: 40, z: 0 });
  assert.notDeepEqual(here.map((mark) => mark.id), there.map((mark) => mark.id));
  const helix = landmarksAround('dna', { x: 0, z: 0 });
  assert.ok(helix.some((mark) => mark.kind === 'helix'));
});

test('a fist is a wall and an open hand attunes', () => {
  assert.deepEqual(gestureFromCount(0), { action: 'wall', element: 'earth' });
  assert.deepEqual(gestureFromCount(1), { action: 'bind', element: 'metal' });
  assert.deepEqual(gestureFromCount(4), { action: 'bind', element: 'fire' });
});

test('iris aim is a mirrored point on the arena', () => {
  const screen = aimFromIrises({ x: 0.25, y: 0.4 }, { x: 0.75, y: 0.6 });
  assert.equal(screen.x, 0.5);
  assert.equal(screen.y, 0.5);
  assert.deepEqual(screenToArena(screen), { x: 0, z: 2 });
});
