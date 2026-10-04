// Plain language in, one validated spell call out.
//
// This is deliberately a lexical matcher rather than a model call: it runs in
// ~0.1 ms, works with the venue wifi down, and can never return a name that
// isn't in the spellbook. `compileWithModel` in ./llm.js layers an LLM on top
// for phrasings this misses, but routes its answer through the same validator.

import { COMPOUND_NAMES, compoundFor } from './compounds.js';
import { ELEMENTS } from './elements.js';
import { SCALE_IDS } from './scales.js';
import { matchHero } from './roster.js';
import { ARCHETYPE_NAMES } from './sketch.js';
import { FORMS, ORDERS, RECOLLECTIONS, TARGETS, SpellError, validateCall } from './spellbook.js';

const VERBS = {
  bolt: ['bolt', 'shoot', 'blast', 'strike', 'hit', 'attack', 'throw', 'fling', 'zap', 'burn', 'launch'],
  fuse: ['fuse', 'combine', 'mix', ...COMPOUND_NAMES],
  wall: ['wall', 'barrier', 'block', 'shield between', 'fence', 'barricade'],
  ward: ['ward', 'shield', 'protect', 'guard', 'armour', 'armor', 'defend'],
  mend: ['mend', 'heal', 'restore', 'repair', 'revive'],
  bind: ['bind', 'attune', 'become', 'switch to', 'change element', 'swap to'],
  shape: ['shape', 'summon', 'transform', 'morph', 'turn my companion', 'spawn'],
  order: ['order', 'tell', 'command', 'make my companion', 'follow me', 'come with me', 'stay with me'],
  ascend: [
    'ascend',
    'zoom',
    'descend',
    'scale',
    'shrink',
    'grow',
    'dive',
    'pull out',
    'go up',
    'go down',
    'world into',
    'take me to',
    'shift to',
    'bring me to',
  ],
  talk: ['talk', 'chat', 'whisper', 'say to'],
  embody: ['embody', 'play the', 'select the', 'choose the', 'i pick', 'play', 'select', 'choose', 'pick'],
  hide: ['hide', 'vanish', 'cloak', 'disappear', 'go dark'],
  recognize: ['recognize', 'recognise', 'reveal', 'i see you', 'found them', 'the signal'],
  autopilot: ['autopilot', 'auto mode', 'auto-mode', 'auto', 'take over', 'play for me', 'afk'],
  conjure: ['conjure', 'build', 'raise', 'erect', 'place', 'put up', 'what i drew'],
  raze: [
    'raze',
    'demolish',
    'knock down',
    'knock it down',
    'tear down',
    'tear it down',
    'pull down',
    'pull it down',
  ],
  recall: ['recall', 'remember', 'what do you know', 'who am i', 'last time', 'sketchbook'],
};

const ELEMENT_WORDS = {
  fire: ['fire', 'flame', 'burn', 'ember', 'plasma', 'huo', '火'],
  water: ['water', 'ice', 'frost', 'wave', 'tide', 'shui', '水'],
  wood: ['wood', 'vine', 'forest', 'root', 'growth', 'wind', 'mu', '木'],
  metal: ['metal', 'steel', 'blade', 'sword', 'iron', 'lightning', 'thunder', 'spark', 'jin', '金'],
  earth: ['earth', 'stone', 'rock', 'dust', 'ground', 'tu', '土'],
};

// Longer aliases first so "cellulose" is not read as "cell".
const SCALE_ALIASES = [
  ['solar system', 'solar'],
  ['milky way', 'galaxy'],
  ['multiverse', 'multiverse'],
  ['cellulose', 'cellulose'],
  ['molecules', 'molecule'],
  ['molecule', 'molecule'],
  ['universe', 'multiverse'],
  ['creature', 'creature'],
  ['galaxy', 'galaxy'],
  ['planet', 'planet'],
  ['solar', 'solar'],
  ['milky', 'galaxy'],
  ['helix', 'dna'],
  ['cells', 'cell'],
  ['city', 'city'],
  ['mars', 'planet'],
  ['cell', 'cell'],
  ['atom', 'atom'],
  ['atoms', 'atom'],
  ['dna', 'dna'],
].filter(([, id]) => SCALE_IDS.includes(id));

const TARGET_WORDS = {
  self: ['me', 'myself', 'my hero', 'self'],
  ally: ['ally', 'teammate', 'my companion', 'companion', 'dragon', 'friend', 'partner'],
  strongest: ['strongest', 'boss', 'biggest', 'toughest', 'leader'],
  weakest: ['weakest', 'lowest', 'hurt one', 'wounded'],
  all: ['everyone', 'all of them', 'all enemies', 'everything'],
  nearest: ['nearest', 'closest', 'enemy', 'enemies', 'them', 'it', 'that one'],
};

const DOWN_WORDS = ['down', 'in', 'smaller', 'shrink', 'dive', 'inward', 'closer'];

export function compile(text) {
  const source = String(text || '').toLowerCase().trim();
  if (!source) {
    return failure(text, 'say something');
  }

  const spellName = pickSpell(source);
  if (!spellName) {
    return failure(text, "no spell matched — try 'throw fire at the nearest one'");
  }

  try {
    const call = validateCall(spellName, extractArgs(spellName, source));
    return {
      ok: true,
      source: text,
      call,
      python: null, // filled in by the caller via renderPython
      via: 'lexical',
    };
  } catch (error) {
    if (error instanceof SpellError) return failure(text, error.message);
    throw error;
  }
}

function failure(source, reason) {
  return { ok: false, source, reason, via: 'lexical' };
}

// Whole-word matching, because short keywords are otherwise lurking inside
// ordinary words: "with" contains "it", "turn" contains the earth root "tu".
// Multi-word phrases and CJK fall back to a plain substring test.
function hasWord(source, word) {
  if (/[^a-z0-9]/.test(word)) return source.includes(word);
  return new RegExp(`\\b${word}\\b`).test(source);
}

const COMPANION_RE = /\b(companion|dragon|robot|alien|pet|partner)\b/;
const TELLING_RE = /\b(tell|order|command|make)\b/;
const BARRIER_RE = /\b(wall|barrier|barricade|fence)\b/;
const DRAWING_RE = new RegExp(`\\b(drew|drawn|drawing|sketch|${ARCHETYPE_NAMES.join('|')})\\b`);

const RECOLLECTION_WORDS = {
  sketches: ['sketch', 'sketches', 'sketchbook', 'drawing', 'drawings', 'drew', 'built'],
  scales: ['scale', 'scales', 'ladder', 'rung', 'rungs', 'where'],
  companion: ['companion', 'dragon', 'robot', 'alien', 'pet', 'yourself'],
  you: ['me', 'myself', 'i', 'about me', 'who am i'],
};

function pickSpell(source) {
  let best = null;
  let bestScore = 0;
  for (const [name, verbs] of Object.entries(VERBS)) {
    for (const verb of verbs) {
      if (!hasWord(source, verb)) continue;
      // Longer phrases are more specific, so they outrank bare keywords.
      const score = verb.length + (source.startsWith(verb) ? 3 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = name;
      }
    }
  }
  // "protect me" is a ward and "attack them" is a bolt, but either one
  // addressed to the companion is a standing order instead.
  if (best && best !== 'shape' && COMPANION_RE.test(source) && TELLING_RE.test(source)) {
    if (findOrder(source)) return 'order';
  }
  if (best === 'ward' && COMPANION_RE.test(source)) return 'order';
  // "raise" is ambiguous between a barrier and a drawing, so let the noun
  // decide: a wall is a wall, but the mountain you drew is a structure.
  if (best === 'conjure' && BARRIER_RE.test(source)) return 'wall';
  if (best === 'wall' && DRAWING_RE.test(source) && !BARRIER_RE.test(source)) return 'conjure';
  // Two named elements, or a compound's own name, is a fusion even when the
  // sentence also contains a plain attack verb ("throw fire and lightning").
  if (
    (best === 'bolt' || best === 'fuse' || best === null) &&
    (COMPOUND_NAMES.some((name) => hasWord(source, name)) || findElements(source).length >= 2)
  ) {
    return 'fuse';
  }
  return best;
}

function extractArgs(spellName, source) {
  switch (spellName) {
    case 'bolt':
      return { element: findElement(source), target: findTarget(source) };
    case 'wall':
      return { element: findElement(source), target: findTarget(source), span: findNumber(source) };
    case 'ward':
      return { element: findElement(source), target: findTarget(source) ?? 'self' };
    case 'mend':
      return { target: findTarget(source) ?? 'self', amount: findNumber(source) };
    case 'bind':
      return { element: findElement(source) };
    case 'shape':
      return { form: findWord(source, FORMS), element: findElement(source) };
    case 'order':
      return { order: findOrder(source) };
    case 'ascend':
      return { steps: findSteps(source), to: findScale(source) };
    case 'fuse':
      return { compound: findCompoundName(source), target: findTarget(source) };
    case 'talk':
      return { line: findPhrase(source) };
    case 'embody':
      return { hero: matchHero(source, hasWord) };
    case 'hide':
      return { who: findWho(source) };
    case 'recognize':
      return { target: findTarget(source) ?? 'gaze' };
    case 'autopilot':
      return { enabled: !/\b(off|stop|disable|back|mine)\b/.test(source) };
    case 'conjure':
      return { sketch: findSketchName(source), span: findNumber(source) };
    case 'recall':
      return { about: findRecollection(source) };
    default:
      return {};
  }
}

function findElement(source) {
  return findElements(source)[0];
}

function findElements(source) {
  const found = [];
  for (const element of ELEMENTS) {
    if (ELEMENT_WORDS[element].some((word) => hasWord(source, word))) found.push(element);
  }
  return found;
}

function findCompoundName(source) {
  for (const name of COMPOUND_NAMES) {
    if (hasWord(source, name)) return name;
  }
  return compoundFor(findElements(source)) ?? undefined;
}

function findScale(source) {
  for (const [alias, id] of SCALE_ALIASES) {
    if (hasWord(source, alias)) return id;
  }
  return undefined;
}

function findPhrase(source) {
  const cleaned = source
    .replace(/\b(please|privately|private|just)\b/g, ' ')
    .replace(/\b(talk|chat|whisper|say)\b/g, ' ')
    .replace(/\b(to|with|my|the|a|companion|dragon|robot|alien|pet|partner)\b/g, ' ')
    .replace(/[^a-z0-9 ']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 80) || undefined;
}

function findTarget(source) {
  let best;
  let bestLength = 0;
  for (const target of TARGETS) {
    for (const word of TARGET_WORDS[target] ?? []) {
      if (hasWord(source, word) && word.length > bestLength) {
        bestLength = word.length;
        best = target;
      }
    }
  }
  return best;
}

function findWho(source) {
  if (/\b(companion|ally|pet|familiar)\b/.test(source)) return 'ally';
  return 'self';
}

function findOrder(source) {
  if (hasWord(source, 'stay with me') || hasWord(source, 'come with me') || hasWord(source, 'follow me')) {
    return 'follow';
  }
  return ORDERS.find((order) => hasWord(source, order));
}

// A quoted nickname beats an archetype word, so "build 'red keep'" finds the
// sketch you named rather than the last tower you happened to draw.
function findSketchName(source) {
  const quoted = source.match(/["'“”‘’]([^"'“”‘’]{1,24})["'“”‘’]/);
  if (quoted) return quoted[1];
  const named = source.match(/\bcalled ([a-z0-9][a-z0-9 '-]{0,23})$/);
  if (named) return named[1];
  return findWord(source, ARCHETYPE_NAMES) ?? 'last';
}

function findRecollection(source) {
  let best;
  let bestLength = 0;
  for (const about of RECOLLECTIONS) {
    for (const word of RECOLLECTION_WORDS[about] ?? []) {
      if (hasWord(source, word) && word.length > bestLength) {
        bestLength = word.length;
        best = about;
      }
    }
  }
  return best;
}

function findWord(source, words) {
  return words.find((word) => hasWord(source, word));
}

function findNumber(source) {
  const match = source.match(/\b(\d{1,3})\b/);
  return match ? Number(match[1]) : undefined;
}

function findSteps(source) {
  const explicit = findNumber(source);
  const descending = DOWN_WORDS.some((word) => hasWord(source, word));
  const magnitude = explicit ?? 1;
  return descending ? -magnitude : magnitude;
}
