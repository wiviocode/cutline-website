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
    return { school: parts.slice(0, -1).join(" "), nickname: parts[parts.length - 1] };
  },
};
