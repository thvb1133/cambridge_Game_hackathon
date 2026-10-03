// Headless match state. Knows nothing about three.js or the DOM, so it can be
// unit-tested in node and driven identically by the keyboard, the compiler,
// the gesture recogniser and the autopilot agent.

import { ELEMENTS, damageMultiplier, generates } from './elements.js';
import { SCALES, clampScaleIndex } from './scales.js';
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
  constructor({ onEvent = () => {} } = {}) {
    this.onEvent = onEvent;
    this.time = 0;
    this.scaleIndex = 2; // start at the cell; it reads well on a projector
    this.autopilot = false;
    this.qi = MAX_QI;
    this.log = [];
    this.projectiles = [];
    this.walls = [];
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
        this.projectiles.push({
          element: resolveElement(args.element),
          from: { ...this.hero.position },
          to: target.id,
          position: { ...this.hero.position },
          speed: 16,
          damage: 26,
        });
        return `bolt away at ${target.name}`;
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
      default:
        return 'nothing happened';
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
    const regen = QI_REGEN_PER_SECOND * (this.nearGeneratingAlly() ? 1.6 : 1);
    this.qi = Math.min(MAX_QI, this.qi + regen * dt);

    this.stepProjectiles(dt);
    this.stepWalls(dt);
    this.stepEnemies(dt);

    if (!this.enemies.length) {
      this.spawnWave();
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

  stepEnemies(dt) {
    for (const enemy of this.enemies) {
      const target = this.companion.alive && Math.random() < 0.002 ? this.companion : this.hero;
      const dx = target.position.x - enemy.position.x;
      const dz = target.position.z - enemy.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const blocked = this.wallBetween(enemy.position, target.position);
      const speed = blocked ? 0.4 : 1.9 + this.scaleIndex * 0.08;
      if (d > 2.2) {
        enemy.position.x += (dx / d) * speed * dt;
        enemy.position.z += (dz / d) * speed * dt;
      }
      enemy.cooldown -= dt;
      if (d <= 2.6 && enemy.cooldown <= 0 && !blocked) {
        enemy.cooldown = 1.6;
        this.damage(target, 9, enemy.element);
      }
      clampToArena(enemy.position);
    }
  }

  wallBetween(a, b) {
    return this.walls.some((wall) => {
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      return distance(mid, wall.position) < wall.span / 2;
    });
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
      if (unit === this.hero) this.onEvent({ type: 'defeat' });
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
