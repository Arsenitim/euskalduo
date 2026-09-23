/**
 * Answer comparison. Stored/displayed text is never modified; these keys are
 * only used to compare what a child typed with the accepted answers.
 */

/** Case- and whitespace-insensitive; keeps accents and letters exactly. */
export function answerKey(text: string): string {
  return text
    .normalize('NFC')
    .toLocaleLowerCase('es')
    .replace(/\s*-\s*/g, '-')
    .replace(/[\s\u00a0]+/g, ' ')
    .replace(/[.!¡?¿]+$/u, '')
    .trim();
}

/** Additionally ignores diacritics (fabrica = fábrica, еж = ёж). */
export function looseKey(text: string): string {
  return answerKey(text).normalize('NFD').replace(/\p{Mn}+/gu, '').normalize('NFC');
}

const SPANISH_ARTICLE = /^(el|la|los|las|un|una|unos|unas) /;

function withoutArticle(key: string): string {
  return key.replace(SPANISH_ARTICLE, '');
}

export type TypedVerdict = 'exact' | 'almost' | 'wrong';

/**
 * Checks a typed answer against every accepted alternative.
 * - 'exact': matches ignoring case and extra spaces
 * - 'almost': matches only when accents are ignored (accepted, but the correct
 *   spelling is shown)
 * For meanings (not Basque terms) a leading Spanish article is optional,
 * so "manzana" is accepted for "la manzana". Basque terms are never
 * morphologically relaxed: "hiri" is not accepted for "hiria".
 */
export function checkTyped(input: string, accepted: readonly string[], kind: 'basque' | 'meaning'): TypedVerdict {
  const typed = answerKey(input);
  if (typed === '') return 'wrong';
  const variants = (key: string) => (kind === 'meaning' ? [key, withoutArticle(key)] : [key]);
  const typedVariants = variants(typed);
  for (const answer of accepted) {
    const key = answerKey(answer);
    if (variants(key).some((v) => typedVariants.includes(v))) return 'exact';
  }
  const typedLoose = variants(looseKey(input));
  for (const answer of accepted) {
    if (variants(looseKey(answer)).some((v) => typedLoose.includes(v))) return 'almost';
  }
  return 'wrong';
}
