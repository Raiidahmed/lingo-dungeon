// The word or phrase a solved challenge teaches, for the word bank.
// word_es is the study-language side (Spanish, or kana for Japanese); word_en is English.

const quoted = (text) => (text || '').match(/'([^']+)'|"([^"]+)"/g)?.map(q => q.slice(1, -1)) ?? [];

// Rough "which side is Spanish" check: accents and common function words.
const ES_WORDS = new Set(('el la los las un una es son esta está estoy tengo quiero necesito puede yo tu tú ella ellos ' +
  'nosotros vamos voy de del que por para y en a al con no mi su me se hoy ayer donde dónde gira sigue cuesta ' +
  'dos tres cinco seis ocho nueve diez despues después hable más').split(' '));
const EN_WORDS = new Set(('the a an is are was i you he she it we they to of and in on at my your please do does not ' +
  'what where can this that am be have has had will would like want need').split(' '));
const words = (s) => s.toLowerCase().match(/[a-záéíóúñü]+/g) ?? [];
const spanishness = (s) => (/[ñáéíóú¿¡]/i.test(s) ? 2 : 0)
  + words(s).filter(w => ES_WORDS.has(w)).length - words(s).filter(w => EN_WORDS.has(w)).length;
const isKana = (s) => /[぀-ヿ]/.test(s);

export function learnedWord(challenge) {
  const fromReward = quoted(challenge.reward);
  const answer = challenge.choices[challenge.answer];
  const first = fromReward[0] ?? answer;
  const differs = (s) => !!s && s.toLowerCase() !== first?.toLowerCase();

  // Rewards usually read "'あ' is 'a'" or "'X' means 'Y'"
  let second = fromReward[1];
  // "What does 'X' mean?" — the answer is the other side
  if (!second && differs(answer)) second = answer;
  // "Translate: 'The cat is small.'" — the other side is quoted in the prompt.
  // Conjugation prompts quote a Spanish infinitive instead, so skip those.
  if (!second && !/conjugate/i.test(challenge.prompt)) second = quoted(challenge.prompt).find(differs);
  if (!first || !differs(second)) return null;

  // Put the study-language side first
  const swap = isKana(second) ? !isKana(first) : !isKana(first) && spanishness(second) > spanishness(first);
  const [word_es, word_en] = swap ? [second, first] : [first, second];
  if (word_es.length > 40) return null;
  return { word_es, word_en };
}
