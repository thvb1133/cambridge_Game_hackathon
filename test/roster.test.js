import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ROSTER } from '../src/core/roster.js';
import { Match } from '../src/core/match.js';

test('the model box is seven original heroes', () => {
  assert.equal(ROSTER.length, 7);
  assert.equal(new Set(ROSTER.map((hero) => hero.id)).size, 7);
  assert.deepEqual(ROSTER.map((hero) => hero.id), [
    'rm',
    'jin',
    'suga',
    'jhope',
    'jimin',
    'taehyung',
    'jungkook',
  ]);
  assert.equal(ROSTER.find((hero) => hero.id === 'taehyung').title, 'Taehyung');
  assert.notEqual(ROSTER.find((hero) => hero.id === 'jungkook').id, 'taehyung');
});

test('selecting a hero retunes the body and the companion dna', () => {
  const match = new Match();
  const line = match.cast('embody', { hero: 'suga' });
  assert.equal(line.ok, true);
  assert.equal(match.hero.rosterId, 'suga');
  assert.equal(match.hero.title, 'Suga');
  assert.equal(match.hero.role, 'shade');
  assert.equal(match.hero.element, 'water');
  assert.equal(match.companion.dna, 'water');
});

test('a hidden fighter shrugs off a hit until the signal is read', () => {
  const match = new Match();
  const rival = match.rival;
  const hp = rival.hp;
  match.hideUnit(rival);
  assert.equal(match.signals.length, 1);
  match.damage(rival, 50, 'fire');
  assert.equal(rival.hp, hp);

  const line = match.cast('recognize', { target: 'nearest' });
  assert.match(line.effect, /recognized/);
  assert.equal(rival.hidden, false);
  match.damage(rival, 50, 'fire');
  assert.ok(rival.hp < hp);
});

test('your own signal does not give you away, and a companion can cloak too', () => {
  const match = new Match();
  match.hideUnit(match.hero);
  match.hideUnit(match.companion);
  assert.equal(match.signals.length, 2);
  const own = match.signals.find((signal) => signal.ownerId === match.hero.id);
  assert.equal(match.reveal(own, 'player'), 'that signal is yours');
  assert.equal(match.hero.hidden, true);
  assert.equal(match.companion.hidden, true);
});

test('the other fighter cloaks on their own and can be found by looking', () => {
  const match = new Match();
  match.time = 8;
  match.step(0.1);
  assert.equal(match.rival.hidden, true);
  assert.ok(match.signals.some((signal) => signal.ownerId === match.rival.id));
});
