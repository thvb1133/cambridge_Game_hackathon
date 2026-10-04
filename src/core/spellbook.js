// The whole surface area a player's words are allowed to reach.
//
// Nothing outside this table can ever be invoked, and no generated text is
// ever evaluated: the compiler's only job is to pick one of these names and
// fill in arguments that pass validation. The Python shown in the chat log is
// rendered *from* the validated call, not parsed into one.

import { COMPOUND_NAMES } from './compounds.js';
import { ELEMENTS } from './elements.js';
import { ROSTER_IDS } from './roster.js';
import { SCALE_IDS } from './scales.js';

export const TARGETS = ['nearest', 'strongest', 'weakest', 'self', 'ally', 'all', 'gaze'];
export const FORMS = ['dragon', 'robot', 'alien'];
export const WHO = ['self', 'ally'];
export const ORDERS = ['protect', 'attack', 'follow', 'hold', 'scout'];
export const RECOLLECTIONS = ['you', 'sketches', 'scales', 'companion'];

// The one free-text parameter in the game: the nickname of a drawing. Kept to
// a deliberately dull character class so a sketch name can never carry markup
// into the log or anything interesting into the model prompt.
const NAME_PATTERN = /^[a-z0-9][a-z0-9 '-]{0,23}$/;

const element = (fallback = 'attuned') => ({
  type: 'enum',
  values: [...ELEMENTS, 'attuned'],
  default: fallback,
});

export const SPELLBOOK = {
  bolt: {
    qi: 12,
    summary: 'Hurl a focused bolt of one element.',
    params: {
      element: element(),
      target: { type: 'enum', values: TARGETS, default: 'nearest' },
    },
  },
  wall: {
    qi: 20,
    summary: 'Raise a barrier between you and a target.',
    params: {
      element: element(),
      target: { type: 'enum', values: TARGETS, default: 'nearest' },
      span: { type: 'number', min: 2, max: 14, default: 6 },
    },
  },
  ward: {
    qi: 16,
    summary: 'Sheathe a unit in elemental qi, absorbing damage.',
    params: {
      element: element(),
      target: { type: 'enum', values: TARGETS, default: 'self' },
    },
  },
  mend: {
    qi: 18,
    summary: 'Restore health to yourself or an ally.',
    params: {
      target: { type: 'enum', values: TARGETS, default: 'self' },
      amount: { type: 'number', min: 5, max: 40, default: 20 },
    },
  },
  bind: {
    qi: 4,
    summary: 'Re-attune yourself to a different element.',
    params: {
      element: { type: 'enum', values: ELEMENTS, default: 'fire' },
    },
  },
  shape: {
    qi: 10,
    summary: 'Reshape your companion into another ghost-realm form.',
    params: {
      form: { type: 'enum', values: FORMS, default: 'dragon' },
      element: element(),
    },
  },
  order: {
    qi: 0,
    summary: 'Give your companion a standing order.',
    params: {
      order: { type: 'enum', values: ORDERS, default: 'protect' },
    },
  },
  ascend: {
    qi: 30,
    summary: 'Shift the arena up or down the scale ladder, or to a named rung.',
    params: {
      steps: { type: 'number', min: -10, max: 10, default: 1 },
      to: { type: 'enum', values: ['next', ...SCALE_IDS], default: 'next' },
    },
  },
  fuse: {
    qi: 22,
    summary: 'Strike with two elements braided into one compound.',
    params: {
      compound: { type: 'enum', values: COMPOUND_NAMES, default: 'plasma' },
      target: { type: 'enum', values: TARGETS, default: 'nearest' },
    },
  },
  talk: {
    qi: 0,
    summary: 'Say something to your companion. It is remembered, never executed.',
    params: {
      line: { type: 'phrase', default: 'hello' },
    },
  },
  embody: {
    qi: 0,
    summary: 'Step into one of the seven heroes in the model box.',
    params: {
      hero: { type: 'enum', values: ROSTER_IDS, default: 'rm' },
    },
  },
  hide: {
    qi: 8,
    summary: 'Vanish and leave a signal. Unrecognized, you cannot be hit.',
    params: {
      who: { type: 'enum', values: WHO, default: 'self' },
    },
  },
  recognize: {
    qi: 0,
    summary: 'Read a signal and make its owner killable.',
    params: {
      target: { type: 'enum', values: ['gaze', 'nearest'], default: 'gaze' },
    },
  },
  autopilot: {
    qi: 0,
    summary: 'Hand your hero to the agent, or take it back.',
    params: {
      enabled: { type: 'boolean', default: true },
    },
  },
  conjure: {
    qi: 26,
    summary: 'Raise something you drew into the arena as solid cover.',
    params: {
      sketch: { type: 'text', default: 'last' },
      span: { type: 'number', min: 1, max: 6, default: 3 },
    },
  },
  raze: {
    qi: 8,
    summary: 'Pull down the nearest structure you raised.',
    params: {},
  },
  recall: {
    qi: 0,
    summary: 'Ask your companion what it remembers about you.',
    params: {
      about: { type: 'enum', values: RECOLLECTIONS, default: 'you' },
    },
  },
};

export const SPELL_NAMES = Object.keys(SPELLBOOK);

export class SpellError extends Error {}

// Coerces and bounds-checks one call against the table above. Throws rather
// than clamping silently on anything the player could not have meant.
export function validateCall(name, rawArgs = {}) {
  const spell = SPELLBOOK[name];
  if (!spell) throw new SpellError(`no such spell: ${name}`);

  const args = {};
  for (const [key, schema] of Object.entries(spell.params)) {
    const supplied = rawArgs[key];
    if (supplied === undefined || supplied === null || supplied === '') {
      args[key] = schema.default;
      continue;
    }
    args[key] = coerce(name, key, schema, supplied);
  }

  const unknown = Object.keys(rawArgs).filter((k) => !(k in spell.params));
  if (unknown.length) {
    throw new SpellError(`${name}() got unexpected argument "${unknown[0]}"`);
  }
  return { name, args, qi: spell.qi };
}

function coerce(spellName, key, schema, value) {
  if (schema.type === 'enum') {
    const normalised = String(value).toLowerCase().trim();
    if (!schema.values.includes(normalised)) {
      throw new SpellError(
        `${spellName}(${key}=…) must be one of ${schema.values.join(', ')}`,
      );
    }
    return normalised;
  }
  if (schema.type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new SpellError(`${spellName}(${key}=…) must be a number`);
    return Math.min(schema.max, Math.max(schema.min, n));
  }
  if (schema.type === 'text') {
    const normalised = String(value).toLowerCase().trim().replace(/\s+/g, ' ');
    if (!NAME_PATTERN.test(normalised)) {
      throw new SpellError(`${spellName}(${key}=…) must be a short plain name`);
    }
    return normalised;
  }
  if (schema.type === 'phrase') {
    const normalised = String(value)
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9 ']/g, '');
    if (!normalised) throw new SpellError(`${spellName}(${key}=…) needs plain words`);
    return normalised.slice(0, 80);
  }
  if (schema.type === 'boolean') {
    if (typeof value === 'boolean') return value;
    const normalised = String(value).toLowerCase().trim();
    if (['true', 'on', 'yes', '1'].includes(normalised)) return true;
    if (['false', 'off', 'no', '0'].includes(normalised)) return false;
    throw new SpellError(`${spellName}(${key}=…) must be true or false`);
  }
  throw new SpellError(`unsupported parameter type ${schema.type}`);
}

// Renders the validated call as the Python line the party sees in chat.
export function renderPython({ name, args }) {
  const spell = SPELLBOOK[name];
  const parts = Object.keys(spell.params)
    .filter((key) => key in args)
    .map((key) => `${key}=${literal(args[key], spell.params[key])}`);
  return `cast.${name}(${parts.join(', ')})`;
}

function literal(value, schema) {
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return String(value);
  // Elements print as bare constants (FIRE) so spells read like incantations;
  // everything else stays a quoted string.
  if (schema?.values && schema.values.includes(value) && isElementish(value)) {
    return value.toUpperCase();
  }
  return `"${value}"`;
}

function isElementish(value) {
  return [...ELEMENTS, 'attuned'].includes(value);
}
