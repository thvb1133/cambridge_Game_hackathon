// What the companion still knows about you after you close the tab.
//
// Everything here is local to the browser — there is no account, no server and
// nothing leaves the machine — but it is genuinely persistent, which is the
// whole point: the second time you boot the game your companion greets you by
// what you did last time, and the structures you drew are still standing.
//
// Storage is injected so the same class can be driven by node in the tests.

export const MEMORY_KEY = 'wuxing.memory.v1';

const MAX_SKETCHES = 12;
const MAX_MOMENTS = 24;

function emptyState(now) {
  return {
    version: 1,
    firstSeen: now,
    lastSeen: now,
    sessions: 0,
    casts: {},
    elements: {},
    sketches: [],
    moments: [],
    scales: { visited: [], deepest: null, highest: null },
    tally: { waves: 0, defeats: 0, conjured: 0 },
    companion: { form: 'dragon', order: 'protect', affinity: 0 },
    chats: [],
  };
}

// Private browsing and sandboxed iframes make localStorage throw on *access*,
// not just on write, so the probe has to be wrapped too.
export function defaultStorage() {
  try {
    const store = globalThis.localStorage;
    store.setItem('wuxing.probe', '1');
    store.removeItem('wuxing.probe');
    return store;
  } catch {
    return memoryStorage();
  }
}

export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

export class Memory {
  constructor({ storage = defaultStorage(), key = MEMORY_KEY, now = () => Date.now() } = {}) {
    this.storage = storage;
    this.key = key;
    this.now = now;
    this.state = this.read();
    // Captured before this session's own activity is folded in, so the
    // companion can talk about "last time" rather than about right now.
    this.previous = JSON.parse(JSON.stringify(this.state));
  }

  read() {
    const now = this.now();
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return emptyState(now);
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1) return emptyState(now);
      // Merge rather than trust: a half-written or hand-edited blob should
      // degrade to defaults, not crash the boot.
      return {
        ...emptyState(now),
        ...parsed,
        scales: { ...emptyState(now).scales, ...parsed.scales },
        chats: Array.isArray(parsed.chats) ? parsed.chats : [],
      };
    } catch {
      return emptyState(now);
    }
  }

  save() {
    this.state.lastSeen = this.now();
    try {
      this.storage.setItem(this.key, JSON.stringify(this.state));
      return true;
    } catch {
      return false; // quota or a locked store; the session still plays fine
    }
  }

  forget() {
    try {
      this.storage.removeItem(this.key);
    } catch {
      /* nothing to do */
    }
    this.state = emptyState(this.now());
    this.previous = JSON.parse(JSON.stringify(this.state));
    return this.state;
  }

  beginSession() {
    this.state.sessions += 1;
    this.save();
    return this.state.sessions;
  }

  get returning() {
    return this.previous.sessions > 0;
  }

  // --- recording ---------------------------------------------------------

  noteCast(name, args = {}) {
    this.state.casts[name] = (this.state.casts[name] ?? 0) + 1;
    if (args.element && args.element !== 'attuned') {
      this.state.elements[args.element] = (this.state.elements[args.element] ?? 0) + 1;
    }
    if (name === 'order' && args.order) this.state.companion.order = args.order;
    if (name === 'shape' && args.form) this.state.companion.form = args.form;
    this.state.companion.affinity = Math.min(100, this.state.companion.affinity + 0.5);
    return this.state.casts[name];
  }

  noteScale(scaleId) {
    const { scales } = this.state;
    if (!scales.visited.includes(scaleId)) scales.visited.push(scaleId);
    scales.highest = scaleId;
    if (!scales.deepest) scales.deepest = scaleId;
    return scales;
  }

  noteOutcome(kind) {
    if (kind in this.state.tally) this.state.tally[kind] += 1;
    if (kind === 'defeats') this.state.companion.affinity = Math.max(0, this.state.companion.affinity - 4);
    return this.state.tally;
  }

  noteChat(line, reply) {
    this.state.chats = this.state.chats ?? [];
    this.state.chats.push({ line, reply, at: this.now() });
    while (this.state.chats.length > 12) this.state.chats.shift();
    this.save();
    return reply;
  }

  remember(text) {
    this.state.moments.push({ at: this.now(), text });
    while (this.state.moments.length > MAX_MOMENTS) this.state.moments.shift();
    return text;
  }

  // --- the sketch library ------------------------------------------------

  rememberSketch(spec) {
    const stored = { ...spec, placed: 0 };
    this.state.sketches = this.state.sketches.filter((s) => s.id !== spec.id);
    this.state.sketches.push(stored);
    while (this.state.sketches.length > MAX_SKETCHES) this.state.sketches.shift();
    this.save();
    return stored;
  }

  notePlaced(id) {
    const sketch = this.state.sketches.find((s) => s.id === id);
    if (sketch) sketch.placed += 1;
    this.state.tally.conjured += 1;
    this.save();
    return sketch ?? null;
  }

  get sketches() {
    return this.state.sketches;
  }

  // Most recent match wins, so "build the mountain" picks the latest mountain
  // and a bare "build" picks whatever you drew last.
  recallSketch(query) {
    const list = this.state.sketches;
    if (!list.length) return null;
    if (!query) return list[list.length - 1];
    const needle = String(query).toLowerCase().trim();
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const sketch = list[i];
      if (sketch.id === needle) return sketch;
      if (sketch.label === needle) return sketch;
      if (String(sketch.name).toLowerCase() === needle) return sketch;
    }
    return null;
  }

  // --- what the companion knows -----------------------------------------

  get favouriteElement() {
    const entries = Object.entries(this.state.elements);
    if (!entries.length) return null;
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }

  get favouriteSpell() {
    const entries = Object.entries(this.state.casts);
    if (!entries.length) return null;
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }

  // One line, chosen from whatever the previous sessions actually contain.
  // Ordered most-specific first so a returning player hears about their own
  // buildings before they hear a generic stat.
  greeting() {
    const prev = this.previous;
    if (!prev.sessions) return 'first time out. draw me something and i will build it.';

    const sketch = prev.sketches[prev.sketches.length - 1];
    if (sketch) {
      return `welcome back. your ${sketch.label} is still standing — say "build it" and i will raise it again.`;
    }
    if (prev.scales.highest) {
      return `welcome back. we left off at the ${prev.scales.highest}${prev.tally.defeats ? ', and you went down there' : ''}.`;
    }
    const element = Object.entries(prev.elements).sort((a, b) => b[1] - a[1])[0];
    if (element) return `welcome back. still favouring ${element[0]}, i assume.`;
    return `welcome back. session ${prev.sessions + 1}.`;
  }

  // Compact summary for the HUD panel.
  summary() {
    return {
      sessions: this.state.sessions,
      returning: this.returning,
      favouriteElement: this.favouriteElement,
      favouriteSpell: this.favouriteSpell,
      sketches: this.state.sketches.length,
      conjured: this.state.tally.conjured,
      waves: this.state.tally.waves,
      defeats: this.state.tally.defeats,
      affinity: Math.round(this.state.companion.affinity),
      visited: this.state.scales.visited.length,
      elements: { ...this.state.elements },
    };
  }
}
