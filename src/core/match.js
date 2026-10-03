// Headless match state. Knows nothing about three.js or the DOM, so it can be
// unit-tested in node and driven identically by the keyboard, the compiler,
// the gesture recogniser and the autopilot agent.

import { ELEMENTS, damageMultiplier, generates } from './elements.js';
import { SCALES, clampScaleIndex } from './scales.js';
import { describeSketch, footprintRadius, structureHeight } from './sketch.js';
import { renderPython, validateCall } from './spellbook.js';

const MAX_QI = 100;
const QI_REGEN_PER_SECOND = 9;
const ARENA_RADIUS = 11;

let nextId = 1;

function makeUnit(partial) {
  return {
    id: `u${nextId++}`,
    faction: 'enemy',
    name: 'wraith',
    element: 'earth',
    hp: 100,
    maxHp: 100,
    shield: 0,
    position: { x: 0, z: 0 },
    velocity: { x: 0, z: 0 },
    cooldown: 0,
    alive: true,
    ...partial,
  };
}

export class Match {
  constructor({ onEvent = () => {}, memory = null } = {}) {
    this.onEvent = onEvent;
    this.memory = memory;
    this.time = 0;
    this.scaleIndex = 2; // start at the cell; it reads well on a projector
    this.autopilot = false;
    this.qi = MAX_QI;
    this.log = [];
    this.projectiles = [];
    this.walls = [];
    // Conjured drawings outlive a defeat on purpose: what you built is the
    // part of a session that is supposed to still be there next time.
    this.structures = [];
    this.units = [];
    this.reset();
  }

  reset() {
    this.units = [];
    this.hero = makeUnit({
      faction: 'player',
      name: 'hero',
      element: 'fire',
      hp: 160,
      maxHp: 160,
      position: { x: 0, z: 4 },
    });
    this.companion = makeUnit({
      faction: 'player',
      name: 'companion',
      form: 'dragon',
      element: 'water',
      hp: 90,
      maxHp: 90,
      position: { x: 1.8, z: 5.2 },
      order: 'protect',
    });
    this.units.push(this.hero, this.companion);
    this.spawnWave();
  }

  spawnWave() {
    const count = 3;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      this.units.push(
        makeUnit({
          name: ['jiangshi', 'fox spirit', 'sword shade'][i % 3],
          element: ELEMENTS[(i * 2 + this.scaleIndex) % ELEMENTS.length],
          hp: 70 + this.scaleIndex * 6,
          maxHp: 70 + this.scaleIndex * 6,
          position: { x: Math.cos(angle) * 8, z: Math.sin(angle) * 8 - 2 },
        }),
      );
    }
  }

  get scale() {
    return SCALES[this.scaleIndex];
  }

  get enemies() {
    return this.units.filter((u) => u.faction === 'enemy' && u.alive);
  }

  // --- spell entry point -------------------------------------------------

  // Every path into the game — typing, speaking, gesturing, the agent —
  // funnels through here, so there is exactly one place where a command can
  // be rejected for cost or legality.
  cast(name, rawArgs = {}, origin = 'console') {
    let call;
    try {
      call = validateCall(name, rawArgs);
    } catch (error) {
      return this.record({ ok: false, origin, reason: error.message });
    }

    if (call.qi > this.qi) {
      return this.record({
        ok: false,
        origin,
        python: renderPython(call),
        reason: `not enough qi (${call.qi} needed, ${Math.floor(this.qi)} left)`,
      });
    }

    this.qi -= call.qi;
    const effect = this.apply(call);
    this.memory?.noteCast(call.name, call.args);
    return this.record({
      ok: true,
      origin,
      python: renderPython(call),
      call,
      effect,
    });
  }

  record(entry) {
    const line = { ...entry, at: this.time };
    this.log.push(line);
    if (this.log.length > 60) this.log.shift();
    this.onEvent({ type: 'log', line });
    return line;
  }

  apply({ name, args }) {
    const resolveElement = (value) => (value === 'attuned' ? this.hero.element : value);

    switch (name) {
      case 'bolt': {
        const target = this.resolveTarget(args.target);
        if (!target) return 'nothing in range';
        const focused = Boolean(this.auraAt(this.hero.position, 'range'));
        this.projectiles.push({
          element: resolveElement(args.element),
          from: { ...this.hero.position },
          to: target.id,
          position: { ...this.hero.position },
          speed: 16,
          damage: focused ? 38 : 26,
        });
        return focused ? `focused bolt at ${target.name}` : `bolt away at ${target.name}`;
      }
      case 'wall': {
        const target = this.resolveTarget(args.target) ?? this.hero;
        const mid = {
          x: (this.hero.position.x + target.position.x) / 2,
          z: (this.hero.position.z + target.position.z) / 2,
        };
        const wall = {
          element: resolveElement(args.element),
          position: mid,
          angle: Math.atan2(
            target.position.z - this.hero.position.z,
            target.position.x - this.hero.position.x,
          ),
          span: args.span,
          hp: 60,
          ttl: 12,
        };
        this.walls.push(wall);
        this.onEvent({ type: 'wall', wall });
        return `wall of ${wall.element} raised`;
      }
      case 'ward': {
        const target = this.resolveTarget(args.target) ?? this.hero;
        target.shield += 45;
        target.wardElement = resolveElement(args.element);
        this.onEvent({ type: 'ward', unit: target });
        return `${target.name} warded`;
      }
      case 'mend': {
        const target = this.resolveTarget(args.target) ?? this.hero;
        const before = target.hp;
        target.hp = Math.min(target.maxHp, target.hp + args.amount);
        this.onEvent({ type: 'mend', unit: target });
        return `${target.name} +${Math.round(target.hp - before)} hp`;
      }
      case 'bind': {
        this.hero.element = args.element;
        this.onEvent({ type: 'attune', element: args.element });
        return `attuned to ${args.element}`;
      }
      case 'shape': {
        this.companion.form = args.form;
        this.companion.element = resolveElement(args.element);
        this.onEvent({ type: 'shape', unit: this.companion });
        return `companion is now a ${args.form}`;
      }
      case 'order': {
        this.companion.order = args.order;
        return `companion will ${args.order}`;
      }
      case 'ascend': {
        return this.shiftScale(args.steps);
      }
      case 'autopilot': {
        this.autopilot = args.enabled;
        this.onEvent({ type: 'autopilot', enabled: args.enabled });
        return args.enabled ? 'agent has the hero' : 'control returned';
      }
      case 'conjure': {
        return this.conjure(args.sketch, args.span);
      }
      case 'raze': {
        const structure = this.nearestStructure();
        if (!structure) return 'nothing of yours standing';
        structure.hp = 0;
        return `${describeSketch(structure.spec)} pulled down`;
      }
      case 'recall': {
        return this.recall(args.about);
      }
      default:
        return 'nothing happened';
    }
  }

  // --- drawings made solid -----------------------------------------------

  // `name` is either a sketch nickname, one of the archetype labels, or the
  // literal "last" for whatever was drawn most recently.
  conjure(name, span = 3) {
    const spec = this.memory?.recallSketch(name === 'last' ? null : name);
    if (!spec) {
      return name === 'last'
        ? 'the sketchbook is empty — draw something first'
        : `nothing in the sketchbook called "${name}"`;
    }
    const structure = this.placeStructure(spec, span);
    this.memory?.notePlaced(spec.id);
    this.onEvent({ type: 'conjure', structure });
    return `${describeSketch(spec)} raised in ${spec.element}`;
  }

  // Dropped a little ahead of the hero, nudged outward until it is not
  // sitting inside something that is already there.
  placeStructure(spec, span = 3) {
    const radius = Math.max(0.8, footprintRadius(spec, span));
    const position = this.freeSpotNear(this.hero.position, radius);
    const structure = {
      id: `st${nextId++}`,
      spec,
      element: spec.element,
      position,
      radius,
      height: structureHeight(spec, span),
      span,
      hp: spec.hp,
      maxHp: spec.hp,
    };
    this.structures.push(structure);
    return structure;
  }

  freeSpotNear(origin, radius) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const angle = (attempt / 12) * Math.PI * 2;
      const reach = 3 + radius + attempt * 0.4;
      const spot = { x: origin.x + Math.cos(angle) * reach, z: origin.z + Math.sin(angle) * reach };
      clampToArena(spot);
      const clash = this.structures.some(
        (s) => distance(s.position, spot) < s.radius + radius + 0.5,
      );
      if (!clash) return spot;
    }
    return { x: origin.x, z: origin.z - 4 };
  }

  nearestStructure() {
    return maxBy(this.structures, (s) => -distance(this.hero.position, s.position));
  }

  // Standing in the lee of something you drew is the reward for building, and
  // which reward depends on what you drew: a house or a dome gives qi back, a
  // tower or a sigil sharpens your bolts.
  auraAt(position, kind) {
    return this.structures.find(
      (s) =>
        s.spec.aura === kind &&
        distance(position, s.position) < s.radius + 2.5 &&
        generates(s.element, this.hero.element),
    );
  }

  // --- what the companion can tell you ------------------------------------

  recall(about) {
    const memory = this.memory;
    if (!memory) return 'i am not keeping notes this session';
    const summary = memory.summary();

    switch (about) {
      case 'sketches': {
        if (!memory.sketches.length) return 'you have not drawn me anything yet';
        const names = memory.sketches.slice(-4).map((s) => describeSketch(s));
        return `in the sketchbook: ${names.join(', ')}`;
      }
      case 'scales':
        return summary.visited
          ? `we have stood on ${summary.visited} of ${SCALES.length} rungs, last at the ${this.scale.title.toLowerCase()}`
          : 'we have not moved off this rung yet';
      case 'companion':
        return `${this.companion.form}, told to ${this.companion.order}, affinity ${summary.affinity}`;
      case 'you':
      default: {
        if (!summary.sessions) return 'we only just met';
        const bits = [`session ${summary.sessions}`];
        if (summary.favouriteElement) bits.push(`you lean ${summary.favouriteElement}`);
        if (summary.favouriteSpell) bits.push(`mostly ${summary.favouriteSpell}`);
        if (summary.conjured) bits.push(`${summary.conjured} things built`);
        if (summary.defeats) bits.push(`${summary.defeats} times down`);
        return bits.join(' · ');
      }
    }
  }

  shiftScale(steps) {
    const next = clampScaleIndex(this.scaleIndex + steps);
    if (next === this.scaleIndex) return 'already at the edge of the ladder';
    const from = this.scale;
    this.scaleIndex = next;
    // Enemies persist through a shift but re-read as the new scale's idiom,
    // which is the whole point of the ladder.
    for (const enemy of this.enemies) {
      enemy.maxHp += 8 * steps;
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + 8 * steps);
    }
    this.memory?.noteScale(this.scale.id);
    this.onEvent({ type: 'scale', from: from.id, to: this.scale.id, steps });
    return `${from.title} → ${this.scale.title}`;
  }

  resolveTarget(selector) {
    switch (selector) {
      case 'self':
        return this.hero;
      case 'ally':
        return this.companion.alive ? this.companion : this.hero;
      case 'strongest':
        return maxBy(this.enemies, (e) => e.hp);
      case 'weakest':
        return maxBy(this.enemies, (e) => -e.hp);
      case 'all':
      case 'nearest':
      default:
        return maxBy(this.enemies, (e) => -distance(this.hero.position, e.position));
    }
  }

  // --- simulation --------------------------------------------------------

  step(dt) {
    this.time += dt;
    let regen = QI_REGEN_PER_SECOND;
    if (this.nearGeneratingAlly()) regen *= 1.6;
    if (this.auraAt(this.hero.position, 'rest')) regen *= 1.5;
    this.qi = Math.min(MAX_QI, this.qi + regen * dt);

    this.stepProjectiles(dt);
    this.stepWalls(dt);
    this.stepStructures();
    this.stepEnemies(dt);

    if (!this.enemies.length) {
      this.spawnWave();
      this.memory?.noteOutcome('waves');
      this.onEvent({ type: 'wave' });
    }
  }

  nearGeneratingAlly() {
    return (
      this.companion.alive &&
      generates(this.companion.element, this.hero.element) &&
      distance(this.hero.position, this.companion.position) < 5
    );
  }

  stepProjectiles(dt) {
    for (const p of this.projectiles) {
      const target = this.units.find((u) => u.id === p.to);
      if (!target || !target.alive) {
        p.dead = true;
        continue;
      }
      const dx = target.position.x - p.position.x;
      const dz = target.position.z - p.position.z;
      const d = Math.hypot(dx, dz) || 1;
      p.position.x += (dx / d) * p.speed * dt;
      p.position.z += (dz / d) * p.speed * dt;
      if (d < 0.9) {
        p.dead = true;
        this.damage(target, p.damage, p.element);
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  stepWalls(dt) {
    for (const wall of this.walls) wall.ttl -= dt;
    const expired = this.walls.filter((w) => w.ttl <= 0 || w.hp <= 0);
    if (expired.length) this.onEvent({ type: 'wall-expired', walls: expired });
    this.walls = this.walls.filter((w) => w.ttl > 0 && w.hp > 0);
  }

  // Unlike walls, structures have no timer: they stand until something
  // batters them down.
  stepStructures() {
    const fallen = this.structures.filter((s) => s.hp <= 0);
    if (!fallen.length) return;
    this.structures = this.structures.filter((s) => s.hp > 0);
    this.onEvent({ type: 'structures-fell', structures: fallen });
  }

  stepEnemies(dt) {
    for (const enemy of this.enemies) {
      const target = this.companion.alive && Math.random() < 0.002 ? this.companion : this.hero;
      const dx = target.position.x - enemy.position.x;
      const dz = target.position.z - enemy.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const cover = this.coverBetween(enemy.position, target.position);
      const speed = cover ? 0.4 : 1.9 + this.scaleIndex * 0.08;
      if (d > 2.2) {
        enemy.position.x += (dx / d) * speed * dt;
        enemy.position.z += (dz / d) * speed * dt;
      }
      enemy.cooldown -= dt;
      if (cover) {
        // Whatever is in the way takes the hit the hero would have taken,
        // which is how a drawing eventually gets knocked down.
        if (cover.hp !== undefined) cover.hp -= 6 * dt;
      } else if (d <= 2.6 && enemy.cooldown <= 0) {
        enemy.cooldown = 1.6;
        this.damage(target, 9, enemy.element);
      }
      clampToArena(enemy.position);
    }
  }

  // Walls are flat spans, structures are discs; either one standing near the
  // midpoint of the line counts as cover.
  coverBetween(a, b) {
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    return (
      this.walls.find((wall) => distance(mid, wall.position) < wall.span / 2) ??
      this.structures.find((s) => distance(mid, s.position) < s.radius) ??
      null
    );
  }

  damage(unit, amount, element) {
    const multiplier = damageMultiplier(element, unit.element);
    let dealt = amount * multiplier;
    if (unit.shield > 0) {
      const absorbed = Math.min(unit.shield, dealt);
      unit.shield -= absorbed;
      dealt -= absorbed;
    }
    unit.hp -= dealt;
    this.onEvent({ type: 'hit', unit, amount: dealt, element, multiplier });
    if (unit.hp <= 0) {
      unit.hp = 0;
      unit.alive = false;
      this.onEvent({ type: 'down', unit });
      if (unit === this.hero) {
        this.memory?.noteOutcome('defeats');
        this.memory?.remember(`went down at the ${this.scale.title.toLowerCase()}`);
        this.onEvent({ type: 'defeat' });
      }
    }
  }

  moveHero(dx, dz, dt) {
    const speed = 6.5;
    this.hero.position.x += dx * speed * dt;
    this.hero.position.z += dz * speed * dt;
    clampToArena(this.hero.position);
  }
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function clampToArena(position) {
  const d = Math.hypot(position.x, position.z);
  if (d > ARENA_RADIUS) {
    position.x = (position.x / d) * ARENA_RADIUS;
    position.z = (position.z / d) * ARENA_RADIUS;
  }
}

function maxBy(items, score) {
  let best = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const value = score(item);
    if (value > bestScore) {
      bestScore = value;
      best = item;
    }
  }
  return best;
}

export { ARENA_RADIUS, MAX_QI };
