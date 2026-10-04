// Doodle in, buildable structure out.
//
// The trick here is to not classify first. A sketch is turned into geometry by
// slicing its silhouette into horizontal bands and reading the ink width of
// each one, which works for *anything* the player draws — a house, a mountain,
// a pagoda, a squiggle. Only once the band profile exists do we label it, and
// the label is cosmetic plus a wuxing element: the geometry is already the
// player's actual drawing, not an archetype swapped in for it.
//
// Pure functions over plain points so the whole recogniser runs in node.

const BANDS = 14;
const DENSIFY_STEP = 0.004; // normalised units between interpolated samples
const MIN_HALF_WIDTH = 0.02;

// Label → how the structure reads in the world. Elements follow the drawing's
// shape rather than being chosen at random: a mass of rock is earth, a spire
// is metal, a dwelling is wood, a vault is water, an open sigil is fire.
const ARCHETYPES = {
  mountain: { element: 'earth', round: false, hp: 320, aura: 'cover' },
  tower: { element: 'metal', round: false, hp: 180, aura: 'range' },
  house: { element: 'wood', round: false, hp: 220, aura: 'rest' },
  dome: { element: 'water', round: true, hp: 240, aura: 'rest' },
  sigil: { element: 'fire', round: true, hp: 120, aura: 'range' },
};

export const ARCHETYPE_NAMES = Object.keys(ARCHETYPES);

export class SketchError extends Error {}

// strokes: [[{x, y}, …], …] in any consistent 2D space, y pointing *down*
// like a canvas. Returns a spec the renderer and the match can both consume.
export function readSketch(strokes, { name = null, now = Date.now() } = {}) {
  const cleaned = (strokes ?? [])
    .map((stroke) => (stroke ?? []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)))
    .filter((stroke) => stroke.length >= 2);

  if (!cleaned.length) throw new SketchError('nothing drawn yet');

  const samples = cleaned.flatMap(densify);
  const box = bounds(samples);
  if (box.width <= 0 && box.height <= 0) throw new SketchError('that is a single dot');

  // Fit into a unit box by the longer side so a small sketch in the corner of
  // the pad builds the same structure as a big one drawn across it.
  const span = Math.max(box.width, box.height);
  const unit = samples.map((p) => ({
    x: (p.x - box.minX) / span,
    // Canvas y grows downward; the world's does not.
    y: (box.maxY - p.y) / span,
  }));

  const bands = readBands(unit, box.height / span);
  const features = measure(bands, cleaned, unit);
  const label = classify(features);
  const archetype = ARCHETYPES[label];

  return {
    id: `sk${Math.floor(now % 1e7).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    name: name || label,
    label,
    element: archetype.element,
    round: archetype.round,
    aura: archetype.aura,
    hp: Math.round(archetype.hp * (0.6 + features.mass)),
    bands,
    features,
    strokeCount: cleaned.length,
    drawnAt: now,
  };
}

// Walk each stroke inserting intermediate points, so a fast flick across the
// pad still deposits ink in every band it crosses.
function densify(stroke) {
  const out = [];
  for (let i = 0; i < stroke.length - 1; i += 1) {
    const a = stroke[i];
    const b = stroke[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / DENSIFY_STEP));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  out.push(stroke[stroke.length - 1]);
  return out;
}

function bounds(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

// The silhouette, sliced bottom to top. Each band records how wide the ink is
// and where its centre sits, which is all the renderer needs to extrude it.
function readBands(unit, height) {
  const top = Math.max(height, 1e-3);
  const raw = Array.from({ length: BANDS }, () => ({ min: Infinity, max: -Infinity }));

  for (const p of unit) {
    const index = Math.min(BANDS - 1, Math.max(0, Math.floor((p.y / top) * BANDS)));
    const band = raw[index];
    if (p.x < band.min) band.min = p.x;
    if (p.x > band.max) band.max = p.x;
  }

  // A gap means the pen jumped that slice (the hollow middle of an O, a gap
  // between two roof lines). Borrowing the nearest filled band keeps the
  // extrusion continuous instead of punching holes through the model.
  for (let i = 0; i < BANDS; i += 1) {
    if (raw[i].min !== Infinity) continue;
    const donor = nearestFilled(raw, i);
    raw[i] = donor ? { ...donor } : { min: 0, max: 0 };
  }

  return raw.map((band, i) => ({
    y0: (i / BANDS) * top,
    y1: ((i + 1) / BANDS) * top,
    halfWidth: Math.max(MIN_HALF_WIDTH, (band.max - band.min) / 2),
    offset: (band.max + band.min) / 2,
  }));
}

function nearestFilled(raw, index) {
  for (let d = 1; d < raw.length; d += 1) {
    const below = raw[index - d];
    if (below && below.min !== Infinity) return below;
    const above = raw[index + d];
    if (above && above.min !== Infinity) return above;
  }
  return null;
}

function measure(bands, strokes, unit) {
  const widths = bands.map((b) => b.halfWidth);
  const base = average(widths.slice(0, 3));
  const crown = average(widths.slice(-3));
  const widest = Math.max(...widths);
  const height = bands[bands.length - 1].y1;

  // Where the silhouette actually loses its width tells the archetypes apart:
  // a mountain narrows the whole way up, a house holds its width and then
  // drops away sharply where the roof starts.
  let roofStart = 1;
  for (let i = 0; i < bands.length; i += 1) {
    if (widths[i] < widest * 0.72) {
      roofStart = i / bands.length;
      break;
    }
  }

  // Stepped silhouettes — a pagoda, a ziggurat, a tiered spire — shed their
  // width in distinct drops low down, where a mountain only ever narrows near
  // the summit. Counting the drops below the shoulder separates the two.
  let tiers = 0;
  for (let i = 1; i < bands.length; i += 1) {
    if (bands[i].y0 > height * 0.7) break;
    if (widths[i] < widths[i - 1] * 0.75) tiers += 1;
  }

  const longest = strokes.reduce((a, b) => (b.length > a.length ? b : a), strokes[0]);
  const first = longest[0];
  const last = longest[longest.length - 1];
  const extent = Math.hypot(...span(longest));

  return {
    height,
    aspect: height / Math.max(2 * widest, 1e-3),
    taper: 1 - crown / Math.max(base, 1e-3),
    roofStart,
    tiers,
    bulge: widest / Math.max(base, 1e-3),
    // Closed outlines (a dome, a ring sigil) end where they began.
    closure: extent > 0 ? 1 - Math.hypot(last.x - first.x, last.y - first.y) / extent : 0,
    sway: spread(bands.map((b) => b.offset)),
    // Rough ink volume, used to size the structure's health.
    mass: clamp(average(widths) * height * 4, 0.15, 1.6),
    inkDensity: clamp(unit.length / 4000, 0, 1),
  };
}

// Deliberately a short, readable ladder of rules rather than a classifier: on
// stage you have to be able to say why the game called your doodle a pagoda.
function classify({ aspect, taper, roofStart, closure, bulge, tiers }) {
  if (aspect > 2.1 && taper < 0.65) return 'tower';
  if (tiers >= 2) return 'tower'; // a pagoda is a spire that steps

  if (taper > 0.72 && roofStart < 0.45) return 'mountain';
  if (taper > 0.45 && roofStart >= 0.45) return 'house';
  if (closure > 0.78 && bulge > 1.12) return 'dome';
  if (taper < 0.25 && closure > 0.6) return 'dome';
  return 'sigil';
}

// Footprint radius in arena units, used for collision and for spacing
// structures apart when several are standing.
export function footprintRadius(spec, scale = 1) {
  return Math.max(...spec.bands.map((b) => b.halfWidth)) * 2 * scale;
}

export function structureHeight(spec, scale = 1) {
  return spec.bands[spec.bands.length - 1].y1 * 2 * scale;
}

// A stable short description for the log and for the companion to refer back
// to: "the mountain you drew on Saturday".
export function describeSketch(spec) {
  const size = spec.features.mass > 1 ? 'great ' : spec.features.mass < 0.4 ? 'small ' : '';
  return `${size}${spec.label}`;
}

function span(points) {
  const b = bounds(points);
  return [b.width, b.height];
}

function average(values) {
  return values.reduce((a, b) => a + b, 0) / (values.length || 1);
}

function spread(values) {
  const mean = average(values);
  return Math.sqrt(average(values.map((v) => (v - mean) ** 2)));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
