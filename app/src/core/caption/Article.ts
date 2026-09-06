/**
 * "a" or "an" for what follows, by its sound rather than its spelling.
 *
 * Team names are where the letter rule breaks: "an Army Black Knight" and "an Ohio State
 * Buckeye" but "a Utah Ute" and "a UCLA Bruin"; "an NYU Violet" and "an LSU Tiger" but "a USC
 * Trojan". An initialism is said letter by letter, so the name of its first letter decides; a
 * word beginning with a long "u" or "eu" starts with a consonant sound.
 */

/** Letters whose names begin with a vowel sound: "an F", "an H", "an L", "an M", "an N", "an R", "an S", "an X". */
const VOWEL_SOUNDING_LETTERS = "AEFHILMNORSX";

export const Article = {
  indefinite(next: string): "a" | "an" {
    const word = next.trim();
    if (!word) return "a";
    // An initialism: two or more capitals not followed by a lowercase letter — NFL, NYU, UCLA, XFL.
    if (/^[A-Z]{2,}(?![a-z])/.test(word)) return VOWEL_SOUNDING_LETTERS.includes(word[0]) ? "an" : "a";
    const lower = word.toLowerCase();
    // "a Utah Ute", "a Union", "a UMass Minuteman", "a user"; but "an umpire", "an upper", "an Ursinus Bear".
    if (lower[0] === "u") return /^u[bcdfghjklmnpqrstvwxz][aeiouy]/.test(lower) ? "a" : "an";
    if (/^eu/.test(lower)) return "a";          // "a European"
    if (/^one\b|^once\b/.test(lower)) return "a"; // "a one-run lead"
    if (/^(hour|honest|honor|honour|heir)/.test(lower)) return "an";
    return "aeio".includes(lower[0]) ? "an" : "a";
  },

  /** The article with a space after it, for building a phrase: "an " + "NFL football game". */
  before(next: string): string { return Article.indefinite(next) + " "; },

  /** Capitalised, for the start of a sentence: "An Ithaca Bomber", "A Utah Ute". */
  leading(next: string): "A" | "An" { return Article.indefinite(next) === "an" ? "An" : "A"; },
};
