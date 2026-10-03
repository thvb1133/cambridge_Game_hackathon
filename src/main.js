import { CompanionAgent } from './core/agent.js';
import { compile } from './core/compiler.js';
import { ELEMENTS, GLYPH, COLOR } from './core/elements.js';
import { compileWithModel, modelEnabled } from './core/llm.js';
import { MAX_QI, Match } from './core/match.js';
import { SCALES, formatMetres } from './core/scales.js';
import { renderPython } from './core/spellbook.js';
import { HandInput } from './input/hands.js';
import { VoiceInput, speak } from './input/voice.js';
import { World } from './render/world.js';

const $ = (id) => document.getElementById(id);

const match = new Match({ onEvent: handleEvent });
const world = new World($('stage'), match);
const agent = new CompanionAgent(match, { onSpeak: companionSays });

const keys = new Set();
let lastFrame = performance.now();
let handPoint = null;

// --- input ---------------------------------------------------------------

window.addEventListener('keydown', (event) => {
  if (event.target.tagName === 'INPUT') {
    if (event.key === 'Escape') event.target.blur();
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    cycleSample();
    return;
  }
  if (event.key === '/' || event.key === 'Enter') {
    event.preventDefault();
    $('prompt-input').focus();
    return;
  }
  if (event.key >= '1' && event.key <= '5') {
    match.cast('bind', { element: ELEMENTS[Number(event.key) - 1] }, 'key');
    return;
  }
  if (event.key === ' ') {
    event.preventDefault();
    match.cast('bolt', { target: 'nearest' }, 'key');
    return;
  }
  if (event.key === 'q') match.cast('ascend', { steps: -1 }, 'key');
  if (event.key === 'e') match.cast('ascend', { steps: 1 }, 'key');
  keys.add(event.key.toLowerCase());
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

$('prompt-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('prompt-input');
  const text = input.value.trim();
  input.value = '';
  if (text) runUtterance(text, 'typed');
});

for (const [id, handler] of [
  ['toggle-hands', toggleHands],
  ['toggle-voice', toggleVoice],
  ['toggle-auto', toggleAuto],
]) {
  $(id).addEventListener('click', handler);
}

const hands = new HandInput({
  onElement: (element) => match.cast('bind', { element }, 'gesture'),
  onCast: () => match.cast('bolt', { target: 'nearest' }, 'gesture'),
  onStatus: setStatus,
});

const voice = new VoiceInput({
  onTranscript: (text) => runUtterance(text, 'spoken'),
  onStatus: setStatus,
});

async function toggleHands() {
  const button = $('toggle-hands');
  if (hands.enabled) {
    hands.stop();
    button.classList.remove('is-on');
    button.textContent = 'hands: off';
    return;
  }
  button.textContent = 'hands: …';
  const ok = await hands.start();
  button.classList.toggle('is-on', ok);
  button.textContent = ok ? 'hands: on' : 'hands: off';
}

function toggleVoice() {
  const on = voice.toggle();
  const button = $('toggle-voice');
  button.classList.toggle('is-on', on);
  button.textContent = on ? 'voice: on' : 'voice: off';
}

function toggleAuto() {
  match.cast('autopilot', { enabled: !match.autopilot }, 'key');
}

// --- the language path ---------------------------------------------------

// One funnel for typed text, speech and (later) anything else that produces
// words. Lexical compile first because it is instant; the model is only
// consulted when nothing matched, and its answer is validated identically.
async function runUtterance(text, origin) {
  let result = compile(text);
  if (!result.ok && modelEnabled) {
    const fromModel = await compileWithModel(text);
    if (fromModel) result = fromModel;
  }

  if (!result.ok) {
    appendLog({ said: text, origin, error: result.reason });
    return;
  }

  const outcome = match.cast(result.call.name, result.call.args, origin);
  appendLog({
    said: text,
    origin: result.via === 'model' ? `${origin} · model` : origin,
    python: renderPython(result.call),
    result: outcome.ok ? outcome.effect : outcome.reason,
    error: outcome.ok ? null : outcome.reason,
  });
}

const SAMPLES = [
  'throw fire at the nearest one',
  'raise a wall of earth between me and the strongest one',
  'shield me with water',
  'turn my companion into a robot',
  'heal me',
  'zoom out to the planet',
  'tell my companion to scout',
  'take over for me',
];
let sampleIndex = 0;
function cycleSample() {
  const input = $('prompt-input');
  input.value = SAMPLES[sampleIndex % SAMPLES.length];
  sampleIndex += 1;
  input.focus();
}

// --- match events --------------------------------------------------------

function handleEvent(event) {
  switch (event.type) {
    case 'log':
      // Casts that originate from the agent or the keyboard never passed
      // through runUtterance, so echo them into the console here.
      if (event.line.origin !== 'typed' && event.line.origin !== 'spoken') {
        appendLog({
          python: event.line.python,
          origin: event.line.origin,
          result: event.line.ok ? event.line.effect : null,
          error: event.line.ok ? null : event.line.reason,
        });
      }
      break;
    case 'scale':
      world.applyScale(match.scale);
      world.punch(event.steps);
      toast(match.scale.title);
      renderLadder();
      break;
    case 'autopilot': {
      const button = $('toggle-auto');
      button.classList.toggle('is-on', event.enabled);
      button.textContent = `autopilot: ${event.enabled ? 'on' : 'off'}`;
      break;
    }
    case 'defeat':
      toast('down');
      setTimeout(() => match.reset(), 1200);
      break;
    case 'wave':
      toast('new wave');
      break;
    default:
      break;
  }
}

function companionSays(line) {
  $('companion-line').textContent = line;
  if (voice.listening || match.autopilot) speak(line);
}

// --- rendering the HUD ---------------------------------------------------

function renderLadder() {
  const ladder = $('ladder');
  ladder.innerHTML = '';
  SCALES.forEach((scale, index) => {
    const li = document.createElement('li');
    if (index === match.scaleIndex) li.className = 'is-current';
    else if (index < match.scaleIndex) li.className = 'is-passed';
    const label = document.createElement('span');
    label.textContent = scale.title;
    li.append(label);
    ladder.append(li);
  });

  $('scale-rung').textContent = match.scale.title;
  $('scale-sub').textContent = `${match.scale.subtitle} · ${formatMetres(match.scale.metres)}`;

  const codex = $('codex');
  codex.innerHTML = '';
  for (const element of ELEMENTS) {
    const row = document.createElement('div');
    row.innerHTML = `<span style="color:#${COLOR[element].toString(16).padStart(6, '0')}">${GLYPH[element]} ${element}</span><em>${match.scale.reading[element]}</em>`;
    codex.append(row);
  }
}

function renderAttunement() {
  const container = $('attunement');
  if (!container.childElementCount) {
    for (const element of ELEMENTS) {
      const button = document.createElement('button');
      button.dataset.element = element;
      button.textContent = GLYPH[element];
      button.style.color = `#${COLOR[element].toString(16).padStart(6, '0')}`;
      button.title = element;
      button.addEventListener('click', () => match.cast('bind', { element }, 'click'));
      container.append(button);
    }
  }
  for (const button of container.children) {
    button.classList.toggle('is-active', button.dataset.element === match.hero.element);
  }
}

function appendLog({ said, python, result, error, origin }) {
  const log = $('log');
  const li = document.createElement('li');

  if (said) {
    const span = document.createElement('span');
    span.className = 'said';
    span.textContent = said;
    li.append(span);
  }
  if (origin) {
    const tag = document.createElement('span');
    tag.className = 'origin';
    tag.textContent = origin;
    li.append(tag);
  }
  if (python) {
    const code = document.createElement('code');
    code.className = 'py';
    code.innerHTML = highlight(python);
    li.append(code);
  }
  if (error) {
    const span = document.createElement('span');
    span.className = 'error';
    span.textContent = `# ${error}`;
    li.append(span);
  } else if (result) {
    const span = document.createElement('span');
    span.className = 'result';
    span.textContent = `# ${result}`;
    li.append(span);
  }

  log.append(li);
  while (log.childElementCount > 24) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
}

function highlight(python) {
  return python
    .replace(/</g, '&lt;')
    .replace(/\b(FIRE|WATER|WOOD|METAL|EARTH|ATTUNED|True|False)\b/g, '<span class="kw">$1</span>');
}

function toast(text) {
  const node = $('toast');
  node.textContent = text;
  node.hidden = false;
  node.style.animation = 'none';
  void node.offsetWidth; // restart the keyframes
  node.style.animation = '';
}

function updateVitals() {
  const hero = match.hero;
  $('hp-fill').style.transform = `scaleX(${Math.max(0, hero.hp / hero.maxHp)})`;
  $('hp-label').textContent = `${Math.ceil(hero.hp)} / ${hero.maxHp}${hero.shield > 0 ? ` +${Math.ceil(hero.shield)}` : ''}`;
  $('qi-fill').style.transform = `scaleX(${match.qi / MAX_QI})`;
  $('qi-label').textContent = `${Math.floor(match.qi)} qi`;
  const companion = $('companion');
  companion.querySelector('strong').textContent = match.companion.form;
  $('companion-order').textContent = match.companion.order;
}

function setStatus(text) {
  $('status').textContent = text;
}

// --- loop ----------------------------------------------------------------

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  let dx = 0;
  let dz = 0;
  if (keys.has('w')) dz -= 1;
  if (keys.has('s')) dz += 1;
  if (keys.has('a')) dx -= 1;
  if (keys.has('d')) dx += 1;
  if (dx || dz) {
    const n = Math.hypot(dx, dz);
    match.moveHero(dx / n, dz / n, dt);
  }

  agent.steer(dt);
  agent.tick(dt);
  match.step(dt);

  const point = hands.poll(now);
  if (point) handPoint = point;
  world.showGaze(handPoint ? screenToArena(handPoint) : null);

  world.sync(dt);
  world.render();
  updateVitals();
  renderAttunement();

  requestAnimationFrame(frame);
}

// Rough mapping from normalised camera space onto the arena floor. Good
// enough for an aim reticle; a real gaze pipeline would raycast properly.
function screenToArena({ x, y }) {
  return { x: (x - 0.5) * 24, z: (y - 0.5) * 22 + 2 };
}

renderLadder();
renderAttunement();
appendLog({
  python: 'cast.bind(element=FIRE)',
  origin: 'boot',
  result: `attuned · ${modelEnabled ? 'model compiler armed' : 'offline compiler'}`,
});
requestAnimationFrame(frame);
