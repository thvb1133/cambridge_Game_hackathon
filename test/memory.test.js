import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SHAPES } from './shapes.js';
import { Match } from '../src/core/match.js';
import { Memory, memoryStorage } from '../src/core/memory.js';
import { readSketch } from '../src/core/sketch.js';

// One backing store, two Memory instances: the second stands in for closing
// the tab and coming back.
function session(storage, now = () => 1_000) {
  return new Memory({ storage, now });
}

test('a session survives the tab closing', () => {
  const storage = memoryStorage();

  const first = session(storage);
  assert.equal(first.returning, false);
  first.beginSession();
  first.noteCast('bolt', { element: 'fire' });
  first.noteCast('bolt', { element: 'fire' });
  first.noteCast('ward', { element: 'water' });
  first.noteScale('planet');
  first.save();

  const second = session(storage);
  assert.equal(second.returning, true);
  assert.equal(second.state.sessions, 1);
  assert.equal(second.favouriteElement, 'fire');
  assert.equal(second.favouriteSpell, 'bolt');
  assert.equal(second.state.scales.highest, 'planet');
});

test('the companion greets a returning player with something it actually saw', () => {
  const storage = memoryStorage();
  const first = session(storage);
  assert.match(first.greeting(), /first time/);

  first.beginSession();
  first.rememberSketch(readSketch(SHAPES.mountain));

  assert.match(session(storage).greeting(), /mountain/);
});

test('the sketchbook is addressable by label and by nickname', () => {
  const memory = session(memoryStorage());
  memory.rememberSketch(readSketch(SHAPES.tower, { name: 'red keep' }));
  memory.rememberSketch(readSketch(SHAPES.mountain));

  assert.equal(memory.recallSketch('red keep').label, 'tower');
  assert.equal(memory.recallSketch('mountain').label, 'mountain');
  assert.equal(memory.recallSketch(null).label, 'mountain', 'a bare recall takes the latest');
  assert.equal(memory.recallSketch('castle'), null);
});

test('a corrupt or foreign blob degrades to a fresh memory', () => {
  const storage = memoryStorage();
  storage.setItem('wuxing.memory.v1', '{not json at all');
  assert.equal(session(storage).state.sessions, 0);

  storage.setItem('wuxing.memory.v1', JSON.stringify({ version: 99, sessions: 400 }));
  assert.equal(session(storage).state.sessions, 0);
});

test('forgetting is complete and immediate', () => {
  const storage = memoryStorage();
  const memory = session(storage);
  memory.beginSession();
  memory.rememberSketch(readSketch(SHAPES.house));
  memory.forget();

  assert.equal(memory.sketches.length, 0);
  assert.equal(session(storage).returning, false);
});

test('a drawing becomes solid cover in the match', () => {
  const memory = session(memoryStorage());
  const match = new Match({ memory });
  memory.rememberSketch(readSketch(SHAPES.mountain));

  const line = match.cast('conjure', { sketch: 'mountain' });
  assert.ok(line.ok, line.reason);
  assert.equal(match.structures.length, 1);

  const structure = match.structures[0];
  assert.equal(structure.element, 'earth');
  assert.ok(structure.radius > 0 && structure.hp > 0);
  assert.equal(memory.state.tally.conjured, 1);

  // Standing behind it, an enemy on the far side cannot reach the hero.
  const across = {
    x: structure.position.x * 2 - match.hero.position.x,
    z: structure.position.z * 2 - match.hero.position.z,
  };
  assert.equal(match.coverBetween(across, match.hero.position), structure);
});

test('conjuring an empty sketchbook fails politely', () => {
  const match = new Match({ memory: session(memoryStorage()) });
  const line = match.cast('conjure', {});
  assert.ok(line.ok, 'a miss is still a legal cast');
  assert.match(line.effect, /sketchbook is empty/);
});

test('what you built outlasts going down', () => {
  const memory = session(memoryStorage());
  const match = new Match({ memory });
  memory.rememberSketch(readSketch(SHAPES.house));
  match.cast('conjure', {});

  match.reset();
  assert.equal(match.structures.length, 1, 'structures should survive a reset');
});

test('the companion can be asked what it knows', () => {
  const memory = session(memoryStorage());
  const match = new Match({ memory });
  memory.beginSession();
  memory.rememberSketch(readSketch(SHAPES.dome, { name: 'the vault' }));

  assert.match(match.recall('sketches'), /dome/);
  assert.match(match.recall('companion'), /dragon/);
  assert.match(match.recall('you'), /session 1/);
});

test('a match with no memory still runs', () => {
  const match = new Match();
  assert.ok(match.cast('bolt', { target: 'nearest' }).ok);
  assert.match(match.cast('conjure', {}).effect, /not keeping notes|sketchbook/);
});
