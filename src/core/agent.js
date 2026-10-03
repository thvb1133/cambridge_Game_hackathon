// The companion's brain, and the same brain pointed at the hero when the
// player toggles autopilot. A behaviour tree rather than a model call: it has
// to tick 60 times a second and it has to be legible on stage, because the
// agent narrates every decision it makes.

import { damageMultiplier } from './elements.js';
import { distance } from './match.js';

const LINES = {
  retreat: ['falling back, you are low', 'disengaging — heal up'],
  focus: ['focusing the weak one', 'taking the hurt one down'],
  counter: ['their element loses to yours, press it', 'you counter this one, go'],
  ward: ['warding you', 'shield up'],
  scout: ['sweeping the far side', 'scouting ahead'],
  hold: ['holding position', 'staying put'],
};

export class CompanionAgent {
  constructor(match, { onSpeak = () => {} } = {}) {
    this.match = match;
    this.onSpeak = onSpeak;
    this.cooldown = 0;
    this.lastLine = '';
  }

  speak(key) {
    const options = LINES[key] ?? [key];
    const line = options[Math.floor(Math.random() * options.length)];
    if (line === this.lastLine) return;
    this.lastLine = line;
    this.onSpeak(line);
  }

  tick(dt) {
    const { match } = this;
    const companion = match.companion;
    if (!companion.alive) return;

    this.cooldown -= dt;
    this.moveCompanion(dt);

    if (this.cooldown > 0) return;
    this.cooldown = 1.4;

    if (match.autopilot) this.driveHero();
    this.decide();
  }

  moveCompanion(dt) {
    const { match } = this;
    const companion = match.companion;
    const anchor = this.anchorFor(companion.order);
    if (!anchor) return;
    const dx = anchor.x - companion.position.x;
    const dz = anchor.z - companion.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4) return;
    const speed = companion.order === 'scout' ? 5.5 : 4.2;
    companion.position.x += (dx / d) * speed * dt;
    companion.position.z += (dz / d) * speed * dt;
  }

  anchorFor(order) {
    const { match } = this;
    const hero = match.hero;
    const threat = this.nearestEnemy();
    switch (order) {
      case 'hold':
        return null;
      case 'attack':
        return threat ? threat.position : hero.position;
      case 'scout':
        return { x: -hero.position.x, z: -hero.position.z };
      case 'follow':
        return { x: hero.position.x - 1.6, z: hero.position.z + 1.6 };
      case 'protect':
      default: {
        if (!threat) return { x: hero.position.x + 1.6, z: hero.position.z + 1.2 };
        // Interpose: sit on the line between the hero and the closest threat.
        return {
          x: (hero.position.x + threat.position.x) / 2,
          z: (hero.position.z + threat.position.z) / 2,
        };
      }
    }
  }

  nearestEnemy() {
    const { match } = this;
    let best = null;
    let bestD = Infinity;
    for (const enemy of match.enemies) {
      const d = distance(match.hero.position, enemy.position);
      if (d < bestD) {
        bestD = d;
        best = enemy;
      }
    }
    return best;
  }

  decide() {
    const { match } = this;
    const hero = match.hero;

    if (hero.hp / hero.maxHp < 0.35 && match.qi >= 18) {
      this.speak('retreat');
      match.cast('mend', { target: 'self' }, 'companion');
      return;
    }
    if (hero.shield <= 0 && match.enemies.length >= 3 && match.qi >= 16) {
      this.speak('ward');
      match.cast('ward', { target: 'self' }, 'companion');
      return;
    }
    if (match.companion.order === 'hold') {
      this.speak('hold');
      return;
    }
    if (match.companion.order === 'scout') {
      this.speak('scout');
      return;
    }

    const target = this.bestTarget();
    if (!target) return;
    this.speak(damageMultiplier(hero.element, target.element) > 1 ? 'counter' : 'focus');
  }

  // Autopilot: kite away from the pack, then throw the element that counters
  // whatever is closest.
  driveHero() {
    const { match } = this;
    const target = this.bestTarget();
    if (!target) return;
    if (match.qi >= 12) {
      match.cast('bolt', { target: 'nearest' }, 'autopilot');
    }
  }

  bestTarget() {
    const { match } = this;
    let best = null;
    let bestScore = -Infinity;
    for (const enemy of match.enemies) {
      const d = distance(match.hero.position, enemy.position);
      const counter = damageMultiplier(match.hero.element, enemy.element);
      // Prefer close, low-health enemies we happen to counter.
      const score = counter * 2 - d * 0.2 - enemy.hp * 0.01;
      if (score > bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  // Autopilot steering, called from the render loop so it shares the hero's
  // movement path with the keyboard.
  steer(dt) {
    const { match } = this;
    if (!match.autopilot) return;
    const threat = this.nearestEnemy();
    if (!threat) return;
    const d = distance(match.hero.position, threat.position);
    const dx = match.hero.position.x - threat.position.x;
    const dz = match.hero.position.z - threat.position.z;
    const n = Math.hypot(dx, dz) || 1;
    const sign = d < 6 ? 1 : -1; // back off when crowded, close when safe
    match.moveHero((dx / n) * sign * 0.6, (dz / n) * sign * 0.6, dt);
  }
}
