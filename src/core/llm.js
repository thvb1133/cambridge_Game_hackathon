// Optional second-stage compiler for phrasings the lexical matcher misses.
//
// The model never returns code. It returns a spell name and arguments, which
// go through the same `validateCall` as everything else, so the worst a
// prompt-injected or hallucinating model can do is cast a legal spell at the
// wrong target. Set VITE_SPELL_ENDPOINT to enable; with it unset the game is
// fully offline.

import { SPELLBOOK, SPELL_NAMES, SpellError, validateCall } from './spellbook.js';

const ENDPOINT = import.meta.env?.VITE_SPELL_ENDPOINT ?? '';
const TIMEOUT_MS = 1800;

export const modelEnabled = Boolean(ENDPOINT);

export function schemaForPrompt() {
  return SPELL_NAMES.map((name) => {
    const spell = SPELLBOOK[name];
    const params = Object.entries(spell.params)
      .map(([key, schema]) => `${key}:${schema.values ? schema.values.join('|') : schema.type}`)
      .join(', ');
    return `${name}(${params})  # ${spell.summary}`;
  }).join('\n');
}

export async function compileWithModel(text) {
  if (!ENDPOINT) return null;

  const controller = new AbortController();
  // A spell that arrives after the fight is over is worse than no spell, so
  // the budget is hard and the caller falls back to the lexical result.
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ utterance: text, spellbook: schemaForPrompt() }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload || typeof payload.name !== 'string') return null;

    const call = validateCall(payload.name, payload.args ?? {});
    return { ok: true, source: text, call, via: 'model' };
  } catch (error) {
    if (error instanceof SpellError) {
      return { ok: false, source: text, reason: error.message, via: 'model' };
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
