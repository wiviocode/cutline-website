/**
 * Splitting "Nebraska Cornhuskers" into a school and a nickname.
 *
 * The caption styles need the two apart — AP writes "Nebraska's Nathalie Lewis" from the school,
 * while the event line uses the full name — but rosters and humans both supply them joined.
 */

/**
 * Nicknames of more than one word, which cannot be recovered by taking the last token. Only
 * ambiguous cases need to be here; "Nebraska Cornhuskers" splits correctly without help.
 */
export const COMPOUND_NICKNAMES = [
  "Fighting Irish", "Golden Gophers", "Nittany Lions", "Scarlet Knights",
  "Crimson Tide", "Tar Heels", "Blue Devils", "Red Storm", "Golden Eagles",
  "Yellow Jackets", "Demon Deacons", "Mean Green", "Ragin Cajuns",
  "Fighting Illini", "Golden Bears", "Horned Frogs", "Green Wave",
  "Red Raiders", "Sun Devils", "Wolf Pack", "Golden Flashes",
];

/**
 * Words that begin a two-word nickname — "Black Knights", "Silver Hawks", "Golden Bears",
 * "Fighting Scots", "Running Rebels". When the word before the last is one of these, the
 * nickname is both. Schools whose own name ends in such a word are listed so they are left alone.
 */
export const NICKNAME_QUALIFIERS = new Set([
  "black", "blue", "red", "golden", "green", "crimson", "scarlet", "purple", "white", "silver", "yellow", "orange", "maroon", "cardinal",
  "fighting", "fightin", "fightin'", "ragin", "ragin'", "runnin", "runnin'", "running", "flying", "flyin'", "screaming", "thundering",
  "mighty", "mean", "big", "great", "wild", "nittany", "horned", "tar", "sun", "sea", "river", "mountain", "demon", "lady", "little", "flying",
]);
const SCHOOLS_ENDING_IN_A_QUALIFIER = ["bowling green", "big rapids", "red bank", "white plains", "blue island", "little rock", "green bay", "mountain view", "river falls"];

export const TeamName = {
  /**
   * `("Notre Dame", "Fighting Irish")` from `"Notre Dame Fighting Irish"`. A single-word input
   * is all school and no nickname — guessing one would be worse than returning nothing.
   */
  split(full: string): { school: string; nickname: string | null } {
    const trimmed = full.trim();
    if (!trimmed) return { school: "", nickname: null };
    for (const nickname of COMPOUND_NICKNAMES) {
      const suffix = " " + nickname;
      if (trimmed.toLowerCase().endsWith(suffix.toLowerCase())) {
        const school = trimmed.slice(0, trimmed.length - suffix.length).trim();
        if (school) return { school, nickname };
      }
    }
    const parts = trimmed.split(" ").filter((p) => p.length > 0);
    if (parts.length <= 1) return { school: trimmed, nickname: null };
    if (parts.length >= 3 && NICKNAME_QUALIFIERS.has(parts[parts.length - 2].toLowerCase())) {
      // "Bowling Green Falcons": the qualifier is the school's own last word, not the nickname's first.
      const upToLast = parts.slice(0, -1).join(" ").toLowerCase();
      if (!SCHOOLS_ENDING_IN_A_QUALIFIER.some((s) => upToLast.endsWith(s))) return { school: parts.slice(0, -2).join(" "), nickname: parts.slice(-2).join(" ") };
    }
    return { school: parts.slice(0, -1).join(" "), nickname: parts[parts.length - 1] };
  },
};
