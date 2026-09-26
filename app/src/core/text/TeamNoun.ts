/**
 * Writing a team's nickname in the singular, for house styles that put it before a name:
 * "Nebraska Cornhusker Adrian Martinez (2)".
 *
 * Most nicknames just lose a trailing "s". The ones that do not are the whole difficulty: mass
 * nouns ("Crimson Tide"), already-singular collectives ("Fighting Irish"), and words whose
 * singular is irregular. Those are listed rather than derived.
 */

/** Nicknames identical in the singular — also the cases where the singular should not be used before a name at all. */
export const INVARIANT_NICKNAMES = new Set([
  "crimson tide", "fighting irish", "green wave", "blue", "orange", "thundering herd",
  "mean green", "big green", "sun devils", "avalanche", "lightning", "magic", "jazz",
  "heat", "thunder", "storm", "chaos", "red storm", "blue hose", "big red", "cardinal",
  "the citadel", "syracuse orange", "million dollar band",
]);

/** Irregular plurals whose singular cannot be produced by dropping a letter. */
export const IRREGULAR_NICKNAMES: Record<string, string> = {
  "buckeyes": "Buckeye", "wolverines": "Wolverine", "hawkeyes": "Hawkeye",
  "cornhuskers": "Cornhusker", "boilermakers": "Boilermaker", "nittany lions": "Nittany Lion",
  "fighting illini": "Fighting Illini", "golden gophers": "Golden Gopher",
  "scarlet knights": "Scarlet Knight", "terrapins": "Terrapin", "badgers": "Badger",
  "spartans": "Spartan", "wildcats": "Wildcat", "huskies": "Husky", "bluejays": "Bluejay",
  "mavericks": "Maverick", "jackrabbits": "Jackrabbit", "coyotes": "Coyote",
  "bulldogs": "Bulldog", "cyclones": "Cyclone", "patriots": "Patriot",
};

export const TeamNoun = {
  /** The singular form of a nickname, or null when it has none worth using. */
  singular(nickname: string): string | null {
    const trimmed = nickname.trim();
    if (!trimmed) return null;
    const key = trimmed.toLowerCase();
    if (INVARIANT_NICKNAMES.has(key)) return null;
    const known = IRREGULAR_NICKNAMES[key];
    if (known) return known;
    // "Cardinals" -> "Cardinal"; "Aggies" -> "Aggie".
    if (key.endsWith("ies") && trimmed.length > 3) return trimmed.slice(0, -3) + "y";
    if (key.endsWith("sses") || key.endsWith("xes") || key.endsWith("ches") || key.endsWith("shes")) return trimmed.slice(0, -2);
    if (key.endsWith("s") && !key.endsWith("ss")) return trimmed.slice(0, -1);
    return null;
  },

  /** "Nebraska Cornhusker" from ("Nebraska", "Cornhuskers"), or null when the nickname has no usable singular. */
  singularTeamLabel(school: string, nickname: string | null | undefined): string | null {
    if (!nickname) return null;
    const one = TeamNoun.singular(nickname);
    if (!one) return null;
    const s = school.trim();
    return s ? `${s} ${one}` : one;
  },
};
