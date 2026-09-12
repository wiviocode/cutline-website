/**
 * Subject and verb agreeing, in sentences this app assembles from two halves.
 *
 * The model writes a bare verb phrase for what it saw — "stand together on the sideline",
 * "celebrates a touchdown" — and the subject in front of it is built here from the scene and the
 * team. Nothing made the two agree, so a frame the model described in the plural came out as
 * "A Malcolm Clippers player stand together on the sideline".
 *
 * Only the first word is touched, because that is the verb: the rest of the phrase is the
 * model's and is left exactly as written.
 */

/** Verbs whose two forms are not formed by rule, singular first. */
const IRREGULAR: [singular: string, plural: string][] = [
  ["is", "are"],
  ["was", "were"],
  ["has", "have"],
  ["does", "do"],
  ["goes", "go"],
];

export const Agreement = {
  /**
   * Whether a phrase is written for a plural subject, or null when its first word says nothing
   * either way. A verb ending in a lone "s" is the third person singular — "stands", "watches";
   * one ending in a double "s" is the plain form — "pass", "press".
   */
  isPlural(phrase: string): boolean | null {
    const head = firstWord(phrase);
    if (!head) return null;
    const w = head.word.toLowerCase();
    for (const [singular, plural] of IRREGULAR) {
      if (w === singular) return false;
      if (w === plural) return true;
    }
    if (w.endsWith("ss")) return true;
    return !w.endsWith("s");
  },

  /** The phrase with its verb in the number the subject needs. */
  agree(phrase: string, plural: boolean): string {
    const head = firstWord(phrase);
    if (!head) return phrase;
    const is = Agreement.isPlural(phrase);
    if (is === null || is === plural) return phrase;
    const verb = plural ? toPlural(head.word) : toSingular(head.word);
    return head.lead + verb + head.rest;
  },
};

function firstWord(phrase: string): { lead: string; word: string; rest: string } | null {
  const m = /^(\s*)([A-Za-z]+)([\s\S]*)$/.exec(phrase);
  return m ? { lead: m[1], word: m[2], rest: m[3] } : null;
}

/** Keep the capital the phrase started with: "Stands" stays "Stand". */
function like(original: string, replacement: string): string {
  return /^[A-Z]/.test(original) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}

/** The plain form, from the third person singular: "carries" → "carry", "watches" → "watch". */
function toPlural(word: string): string {
  const w = word.toLowerCase();
  for (const [singular, plural] of IRREGULAR) if (w === singular) return like(word, plural);
  if (w.length > 4 && w.endsWith("ies")) return like(word, w.slice(0, -3) + "y");
  if (/(?:ss|sh|ch|x|z|o)es$/.test(w)) return like(word, w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss")) return like(word, w.slice(0, -1));
  return word;
}

/** The third person singular, from the plain form: "carry" → "carries", "watch" → "watches". */
function toSingular(word: string): string {
  const w = word.toLowerCase();
  for (const [singular, plural] of IRREGULAR) if (w === plural) return like(word, singular);
  if (/(?:s|sh|ch|x|z|o)$/.test(w)) return like(word, w + "es");
  if (/[^aeiou]y$/.test(w)) return like(word, w.slice(0, -1) + "ies");
  return like(word, w + "s");
}
