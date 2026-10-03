import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compile } from '../src/core/compiler.js';
import { renderPython, validateCall, SpellError } from '../src/core/spellbook.js';
import { damageMultiplier } from '../src/core/elements.js';
import { Match } from '../src/core/match.js';

function py(text) {
  const result = compile(text);
  assert.ok(result.ok, `expected "${text}" to compile: ${result.reason}`);
  return renderPython(result.call);
}

test('compiles the demo script', () => {
  assert.equal(py('throw fire at the nearest one'), 'cast.bolt(element=FIRE, target="nearest")');
  assert.equal(
    py('raise a wall of earth between me and the strongest one'),
    'cast.wall(element=EARTH, target="strongest", span=6)',
  );
  assert.equal(py('shield me with water'), 'cast.ward(element=WATER, target="self")');
  assert.equal(py('heal me'), 'cast.mend(target="self", amount=20)');
  assert.equal(py('turn my companion into a robot'), 'cast.shape(form="robot", element=ATTUNED)');
  assert.equal(py('tell my companion to scout'), 'cast.order(order="scout")');
  assert.equal(py('take over for me'), 'cast.autopilot(enabled=True)');
});

test('building and remembering are reachable from plain speech', () => {
  assert.equal(py('build the mountain i drew'), 'cast.conjure(sketch="mountain", span=3)');
  assert.equal(py('put up what i drew'), 'cast.conjure(sketch="last", span=3)');
  assert.equal(py('raise the house'), 'cast.conjure(sketch="house", span=3)');
  assert.equal(py('knock it down'), 'cast.raze()');
  assert.equal(py('what do you remember about me'), 'cast.recall(about="you")');
  assert.equal(py('show me the sketchbook'), 'cast.recall(about="sketches")');
});

test('"raise a wall" is still a wall, not a building', () => {
  assert.equal(
    py('raise a wall of earth between me and the strongest one'),
    'cast.wall(element=EARTH, target="strongest", span=6)',
  );
  assert.equal(py('build a barrier'), 'cast.wall(element=ATTUNED, target="nearest", span=6)');
});

test('a sketch nickname survives the trip through the compiler', () => {
  assert.equal(py('build "red keep"'), 'cast.conjure(sketch="red keep", span=3)');
  assert.equal(py('conjure the one called jade pagoda'), 'cast.conjure(sketch="jade pagoda", span=3)');
});

test('direction words flip a scale shift', () => {
  assert.equal(py('zoom out'), 'cast.ascend(steps=1)');
  assert.equal(py('zoom in'), 'cast.ascend(steps=-1)');
  assert.equal(py('zoom out 3'), 'cast.ascend(steps=3)');
});

test('unattuned spells defer to the caster element', () => {
  assert.equal(py('blast the weakest one'), 'cast.bolt(element=ATTUNED, target="weakest")');
});

test('nonsense is rejected rather than guessed at', () => {
  const result = compile('what is the wifi password');
  assert.equal(result.ok, false);
  assert.match(result.reason, /no spell matched/);
});

test('the validator is the only gate into the game', () => {
  assert.throws(() => validateCall('rm_rf', {}), SpellError);
  assert.throws(() => validateCall('bolt', { element: 'plasma' }), SpellError);
  assert.throws(() => validateCall('bolt', { eval: 'x' }), SpellError);
  // Out-of-range numbers clamp instead of throwing, so a stray "heal me 9000"
  // still casts something sane.
  assert.equal(validateCall('mend', { amount: 9000 }).args.amount, 40);
});

test('wuxing overcoming cycle', () => {
  assert.equal(damageMultiplier('water', 'fire'), 1.5);
  assert.equal(damageMultiplier('fire', 'water'), 0.6);
  assert.equal(damageMultiplier('fire', 'fire'), 1);
});

test('a cast moves the match forward and costs qi', () => {
  const match = new Match();
  const before = match.qi;
  const line = match.cast('bolt', { target: 'nearest' });
  assert.ok(line.ok, line.reason);
  assert.ok(match.qi < before);
  assert.equal(match.projectiles.length, 1);

  for (let i = 0; i < 120; i += 1) match.step(1 / 60);
  assert.equal(match.projectiles.length, 0, 'projectile should resolve');
});

test('qi exhaustion refuses a cast instead of throwing', () => {
  const match = new Match();
  match.qi = 0;
  const line = match.cast('bolt', { target: 'nearest' });
  assert.equal(line.ok, false);
  assert.match(line.reason, /not enough qi/);
});

test('the scale ladder clamps at both ends', () => {
  const match = new Match();
  match.cast('ascend', { steps: -7 });
  assert.equal(match.scale.id, 'atom');
  match.qi = 100;
  match.cast('ascend', { steps: 7 });
  assert.equal(match.scale.id, 'multiverse');
});
