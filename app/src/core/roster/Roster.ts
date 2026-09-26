/**
 * Teams and players.
 *
 * A team carries the school and the nickname apart because house styles need them apart — AP
 * writes "Nebraska wide receiver …", Hurrdat "Waverly Viking …" — and it carries today's uniform
 * in words, because the uniform, not the school colours, is what tells the two sides apart in a
 * photograph.
 */

/** Which side of the ball a football player lines up on. */
export type PlayerSide = "offense" | "defense" | "specialTeams" | "unknown";

export interface Player {
  id: string;
  /** As printed; leading zeros matter ("0" and "00" are different players). Empty when unnumbered. */
  number: string;
  firstName: string;
  lastName: string;
  /** Lowercase caption word: "wide receiver", "outside hitter". */
  position: string;
  /** As the roster printed it: "WR", "OH", "RB, MLB". */
  positionAbbr: string;
  side: PlayerSide;
  /** A two-way player's other position, on the other unit. */
  secondary?: { position: string; side: PlayerSide } | null;
  classYear?: string | null;
  /** A roster headshot, when the page had one. Used only for on-device face matching. */
  headshotURL?: string | null;
}

export interface Team {
  id: string;
  /** How captions name the school: "Nebraska", "Bowling Green", "Waverly". */
  school: string;
  /** "Cornhuskers". Null when unknown — never guessed into a caption. */
  nickname: string | null;
  /** Published colours, as hex without '#'. */
  colors: string[];
  /** Today's uniform in words: "red jerseys with white numbers". The strongest team cue. */
  uniform: string;
  players: Player[];
  sourceURL?: string | null;
  logoURL?: string | null;
}

export function newID(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const Player = {
  make(p: Partial<Player> & { number: string }): Player {
    return {
      id: p.id ?? newID(),
      number: p.number.trim(),
      firstName: (p.firstName ?? "").trim(),
      lastName: (p.lastName ?? "").trim(),
      position: p.position ?? "",
      positionAbbr: p.positionAbbr ?? "",
      side: p.side ?? "unknown",
      secondary: p.secondary ?? null,
      classYear: p.classYear ?? null,
      headshotURL: p.headshotURL ?? null,
    };
  },
  fullName(p: Player): string {
    return [p.firstName, p.lastName].filter(Boolean).join(" ");
  },
  playsOn(p: Player, side: PlayerSide): boolean {
    return p.side === side || p.secondary?.side === side;
  },
  /** The position to print for a play on `side`: a two-way player's other position when that is the unit shown. */
  positionFor(p: Player, side: PlayerSide | null): string {
    if (side && p.secondary && p.secondary.side === side && p.side !== side) return p.secondary.position;
    return p.position;
  },
  /** Shirt-number order, unnumbered last. */
  compare(a: Player, b: Player): number {
    const x = parseInt(a.number, 10), y = parseInt(b.number, 10);
    const xn = isNaN(x) ? 1e9 : x, yn = isNaN(y) ? 1e9 : y;
    if (xn !== yn) return xn - yn;
    if (a.number.length !== b.number.length) return a.number.length - b.number.length; // "0" before "00"
    return a.lastName.localeCompare(b.lastName);
  },
};

export const Team = {
  make(p: Partial<Team> & { school: string }): Team {
    return {
      id: p.id ?? newID(),
      school: p.school.trim(),
      nickname: p.nickname?.trim() || null,
      colors: p.colors ?? [],
      uniform: p.uniform ?? "",
      players: p.players ?? [],
      sourceURL: p.sourceURL ?? null,
      logoURL: p.logoURL ?? null,
    };
  },
  /** "Nebraska Cornhuskers", or "Nebraska". */
  fullName(t: Team): string {
    return t.nickname ? `${t.school} ${t.nickname}` : t.school;
  },
  /** A nickname is a plural collective and takes "the": "the Gretna Dragons", but plain "Nebraska". */
  withArticle(t: Team): string {
    return t.nickname ? `the ${Team.fullName(t)}` : t.school;
  },
  byNumber(t: Team, number: string): Player[] {
    const n = number.trim();
    return n ? t.players.filter((p) => p.number === n) : [];
  },
  sortedPlayers(t: Team): Player[] {
    return [...t.players].sort(Player.compare);
  },
};

/** The two sides of a game. A is conventionally the photographer's own team, B the opponent. */
export interface Matchup {
  a: Team;
  b: Team;
}

export type TeamKey = "A" | "B";

export const Matchup = {
  team(m: Matchup, key: TeamKey): Team { return key === "A" ? m.a : m.b; },
  other(key: TeamKey): TeamKey { return key === "A" ? "B" : "A"; },
};
