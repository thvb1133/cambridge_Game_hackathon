// What the companion says back in the private channel.
//
// Deterministic on purpose: a talk line is remembered and answered, never
// evaluated. The reply is a sentence, not a spell.

export function companionReply(line, { form = 'dragon', order = 'protect', scale = 'cell', affinity = 0 } = {}) {
  const text = String(line || '').toLowerCase();

  if (/\b(protect|guard|cover)\b/.test(text)) return 'i will stand between you and them.';
  if (/\b(attack|fight|strike|hunt)\b/.test(text)) return 'point, and i go in first.';
  if (/\b(follow|close|stay|with me)\b/.test(text)) return 'i stay on your shoulder.';
  if (/\b(mars|planet|dust)\b/.test(text)) return 'say the word and we take the dust basin.';
  if (/\b(remember|who am i|about me)\b/.test(text)) {
    return `i remember. affinity ${affinity}. we are at the ${scale.toLowerCase()}.`;
  }
  if (/\b(hello|hi|hey)\b/.test(text)) {
    return `${form} here. holding ${order}. the ${scale.toLowerCase()} is under us.`;
  }
  return `heard. still your ${form}, still on ${order}.`;
}
