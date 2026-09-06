/**
 * The two teams in a matchup, and their players.
 *
 * Fields mirror the original app's `RosterPlayer`, recovered from Swift reflection metadata and
 * confirmed on the wire. `Team` carries the school and the nickname apart, because the caption
 * styles need them apart: AP writes "Nebraska's Nathalie Lewis" from the school, while the event
 * line uses the full name.
 */

export type RosterRole = "player" | "coach" | "referee" | "staff" | "other";
/**
 * Which side of the ball a football player lines up on. Used to disambiguate a jersey number
 * that appears on both the offensive and defensive roster.
 */
export type PlayerSide = "offense" | "defense" | "specialTeams" | "unknown";

export interface Team {
  id: string;
  /** Display name without mascot, e.g. `Kentucky`. */
  name: string;
  /** Mascot / nickname, e.g. `Wildcats`. Style rules decide whether it is included. */
  nickname?: string | null;
  /** Configured uniform colour, matched against the model's `jersey_color`. */
  uniformColor: string;
}

export interface RosterPlayer {
  id: string;
  teamID: string;
  jerseyNumber: string;
  firstName: string;
  lastName: string;
  fullNameOverride?: string | null;
  position: string;
  role: RosterRole;
  side: PlayerSide;
  /**
   * A two-way player's other position, on the other unit — "RB, MLB" on a high-school roster.
   * The caption names whichever unit the photograph shows.
   */
  secondary?: { position: string; side: PlayerSide } | null;
}

export interface Roster {
  team1: Team;
  team2: Team;
  players: RosterPlayer[];
}

export function newID(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID().toUpperCase();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const Team = {
  make(name: string, uniformColor: string, nickname?: string | null, id = newID()): Team {
    return { id, name, nickname: nickname ?? null, uniformColor };
  },

  fullName(t: Team): string {
    const n = t.nickname?.trim();
    return n ? `${t.name} ${n}` : t.name;
  },

  /**
   * Whether "the" belongs in front of this team's name.
   *
   * A nickname is a plural collective and takes the article — "the Cornhuskers", "the Notre
   * Dame Fighting Irish". A bare school name does not: "against Nebraska", never "against the
   * Nebraska". This began to matter when ESPN was found to supply no mascot for some leagues,
   * which put "the Nebraska" into three quarters of a real shoot's captions.
   */
  takesDefiniteArticle(t: Team): boolean {
    return !!t.nickname && t.nickname.trim().length > 0;
  },

  /** "the Ohio State Buckeyes", or plain "Nebraska". */
  withArticle(t: Team): string {
    return Team.takesDefiniteArticle(t) ? `the ${Team.fullName(t)}` : Team.fullName(t);
  },

  /**
   * A possessive-style qualifier for a group: "Members of the Cornhuskers" reads correctly,
   * "Members of the Nebraska" does not — that becomes "Nebraska players".
   */
  groupLabel(t: Team, noun: string): string {
    return Team.takesDefiniteArticle(t) ? `Members of ${Team.withArticle(t)}` : `${Team.fullName(t)} ${noun}`;
  },
};

export const RosterPlayer = {
  make(p: Partial<RosterPlayer> & { teamID: string; jerseyNumber: string }): RosterPlayer {
    return {
      id: p.id ?? newID(),
      teamID: p.teamID,
      jerseyNumber: p.jerseyNumber,
      firstName: p.firstName ?? "",
      lastName: p.lastName ?? "",
      fullNameOverride: p.fullNameOverride ?? null,
      position: p.position ?? "",
      role: p.role ?? "player",
      side: p.side ?? "unknown",
      secondary: p.secondary ?? null,
    };
  },

  fullName(p: RosterPlayer): string {
    const o = p.fullNameOverride?.trim();
    if (o) return o;
    return [p.firstName, p.lastName].filter((s) => s.length > 0).join(" ");
  },

  /** True when the player lines up on `side`, in either of their positions. */
  playsOn(p: RosterPlayer, side: PlayerSide): boolean {
    return p.side === side || p.secondary?.side === side;
  },

  /**
   * The position to print for a play on `side`: the secondary one when that is the unit shown,
   * otherwise the primary. A photograph that shows no particular unit gets the primary.
   */
  positionFor(p: RosterPlayer, side: PlayerSide | null): string {
    if (side && p.secondary && p.secondary.side === side && p.side !== side) return p.secondary.position;
    return p.position;
  },
};

export const Roster = {
  make(team1: Team, team2: Team, players: RosterPlayer[] = []): Roster {
    return { team1, team2, players };
  },

  /** A roster for an event with no sides. Both teams are blank and never consulted. */
  noTeams(): Roster {
    return { team1: Team.make("", ""), team2: Team.make("", ""), players: [] };
  },

  team(r: Roster, id: string): Team | null {
    if (r.team1.id === id) return r.team1;
    if (r.team2.id === id) return r.team2;
    return null;
  },

  players(r: Roster, teamID: string): RosterPlayer[] {
    return r.players.filter((p) => p.teamID === teamID);
  },

  /** The team a player belongs to. */
  teamOf(r: Roster, player: RosterPlayer): Team | null {
    return Roster.team(r, player.teamID);
  },

  /** Everyone on the same team, for the swap menu, in shirt-number order. */
  teammates(r: Roster, player: RosterPlayer): RosterPlayer[] {
    return r.players
      .filter((p) => p.teamID === player.teamID)
      .sort((a, b) => {
        const l = parseInt(a.jerseyNumber, 10), rr = parseInt(b.jerseyNumber, 10);
        const ln = isNaN(l) ? Number.MAX_SAFE_INTEGER : l;
        const rn = isNaN(rr) ? Number.MAX_SAFE_INTEGER : rr;
        return ln !== rn ? ln - rn : a.lastName.localeCompare(b.lastName);
      });
  },
};
