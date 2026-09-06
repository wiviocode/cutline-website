/**
 * Final text tidy-up: the artefacts left when an unidentified player has no readable number —
 * `XXXXX (?)`, `XXXXX ( )`, and `XXXXX #?` — plus spacing, the opening capital, and the full stop.
 */

const PLACEHOLDER_ARTEFACTS = [/\bXXXXX\s+\(\?\)/g, /\bXXXXX\s+\(\s*\)/g, /\bXXXXX\s+#\s*\?/g];

export const Cleanup = {
  tidy(input: string): string {
    let s = input;
    for (const p of PLACEHOLDER_ARTEFACTS) s = s.replace(p, "XXXXX");
    s = s.replace(/\s{2,}/g, " ");
    s = s.replace(/\s+([,.])/g, "$1");
    s = s.trim();

    // Start the sentence with a capital. This never mattered while every caption opened with a
    // team or player name; a rosterless caption opens with "a Nebraska Cornhusker".
    if (s && s[0] !== s[0].toUpperCase() && s[0] === s[0].toLowerCase()) s = s[0].toUpperCase() + s.slice(1);

    // A caption that closes with a bracketed credit — "(AP Photo/Eli Larson)" — is already
    // finished. Adding a full stop after the bracket gives "…Larson)." which no desk writes.
    // Imagn's record ends on its credit with no period, whatever the house is called.
    if (s && !s.endsWith(".") && !s.endsWith("!") && !s.endsWith("?") && !s.endsWith(")") && !/Mandatory Credit: /.test(s)) s += ".";
    return s;
  },
};
