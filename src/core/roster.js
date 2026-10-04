// The model box is the seven members, each as their own cartoon hero.
// Taehyung (V) and Jungkook are two different people. These silhouettes are
// fan-made stand-ins, not official art. Drop a Hyper3D .glb on a card, or
// put one at public/models/<id>.glb, and it replaces the cartoon.

export const ROSTER = [
  { id: 'rm', title: 'RM', role: 'lead', element: 'metal', words: ['rm', 'namjoon'], blurb: 'lead' },
  { id: 'jin', title: 'Jin', role: 'blade', element: 'fire', words: ['jin', 'seokjin'], blurb: 'blade' },
  { id: 'suga', title: 'Suga', role: 'shade', element: 'water', words: ['suga', 'yoongi'], blurb: 'shade' },
  { id: 'jhope', title: 'J-Hope', role: 'spark', element: 'wood', words: ['jhope', 'j-hope', 'hoseok', 'hobi'], blurb: 'spark' },
  { id: 'jimin', title: 'Jimin', role: 'dancer', element: 'earth', words: ['jimin'], blurb: 'dancer' },
  { id: 'taehyung', title: 'Taehyung', role: 'voice', element: 'fire', words: ['taehyung', 'tae', 'v'], blurb: 'V' },
  { id: 'jungkook', title: 'Jungkook', role: 'athlete', element: 'metal', words: ['jungkook', 'jk'], blurb: 'athlete' },
];

export const ROSTER_IDS = ROSTER.map((hero) => hero.id);

export function rosterById(id) {
  return ROSTER.find((hero) => hero.id === id) ?? ROSTER[0];
}

export function matchHero(source, hasWord) {
  let best = null;
  let score = 0;
  for (const hero of ROSTER) {
    for (const word of hero.words) {
      if (!hasWord(source, word) || word.length <= score) continue;
      score = word.length;
      best = hero.id;
    }
  }
  return best;
}
