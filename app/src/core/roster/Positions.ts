/**
 * Position abbreviations as roster pages print them, and which unit each football position
 * belongs to.
 *
 * High-school rosters list two-way players with an offensive and a defensive position — MaxPreps
 * writes "RB, MLB" — and the caption should name the one the photograph shows: "running back Sam
 * Mundt" carrying the ball, "linebacker Sam Mundt" making the tackle. That needs the side of each
 * position, which no roster states but every abbreviation implies.
 */

import type { PlayerSide } from "./Roster";

const FOOTBALL: Record<string, [word: string, side: PlayerSide]> = {
  QB: ["quarterback", "offense"], RB: ["running back", "offense"], HB: ["halfback", "offense"], TB: ["tailback", "offense"],
  FB: ["fullback", "offense"], WR: ["wide receiver", "offense"], SE: ["split end", "offense"], FL: ["flanker", "offense"],
  TE: ["tight end", "offense"], WB: ["wingback", "offense"], SB: ["slotback", "offense"], H: ["H-back", "offense"],
  OL: ["offensive lineman", "offense"], C: ["center", "offense"], G: ["guard", "offense"], OG: ["guard", "offense"],
  LG: ["guard", "offense"], RG: ["guard", "offense"], T: ["tackle", "offense"], OT: ["offensive tackle", "offense"],
  LT: ["tackle", "offense"], RT: ["tackle", "offense"],
  DL: ["defensive lineman", "defense"], DE: ["defensive end", "defense"], DT: ["defensive tackle", "defense"],
  NT: ["nose tackle", "defense"], NG: ["nose guard", "defense"], EDGE: ["edge rusher", "defense"],
  LB: ["linebacker", "defense"], ILB: ["inside linebacker", "defense"], OLB: ["outside linebacker", "defense"],
  MLB: ["middle linebacker", "defense"], WLB: ["linebacker", "defense"], SLB: ["linebacker", "defense"],
  DB: ["defensive back", "defense"], CB: ["cornerback", "defense"], S: ["safety", "defense"], FS: ["free safety", "defense"],
  SS: ["strong safety", "defense"], NB: ["nickelback", "defense"],
  K: ["kicker", "specialTeams"], PK: ["placekicker", "specialTeams"], P: ["punter", "specialTeams"], LS: ["long snapper", "specialTeams"],
  KR: ["kick returner", "specialTeams"], PR: ["punt returner", "specialTeams"], KO: ["kickoff specialist", "specialTeams"],
  ATH: ["athlete", "unknown"], UTL: ["utility", "unknown"],
};

const OTHER: Record<string, Record<string, string>> = {
  basketball: { G: "guard", PG: "point guard", SG: "shooting guard", F: "forward", SF: "small forward", PF: "power forward", C: "center", W: "wing", GF: "guard", FC: "forward" },
  volleyball: { OH: "outside hitter", MB: "middle blocker", MH: "middle hitter", S: "setter", L: "libero", DS: "defensive specialist", RS: "right side hitter", OPP: "opposite", OP: "opposite" },
  soccer: { GK: "goalkeeper", G: "goalkeeper", D: "defender", DF: "defender", CB: "center back", FB: "fullback", M: "midfielder", MF: "midfielder", CM: "midfielder", F: "forward", FW: "forward", ST: "striker", W: "winger" },
  baseball: { P: "pitcher", RHP: "pitcher", LHP: "pitcher", C: "catcher", "1B": "first baseman", "2B": "second baseman", "3B": "third baseman", SS: "shortstop", LF: "left fielder", CF: "center fielder", RF: "right fielder", OF: "outfielder", IF: "infielder", DH: "designated hitter", UT: "utility", UTL: "utility" },
  hockey: { G: "goaltender", D: "defenseman", F: "forward", C: "center", LW: "left wing", RW: "right wing", W: "wing" },
  lacrosse: { G: "goalie", D: "defender", M: "midfielder", A: "attacker", LSM: "long-stick midfielder", FO: "faceoff specialist", FOGO: "faceoff specialist" },
};
OTHER.softball = OTHER.baseball;

/** Words the football table produces, so a position already written out can be sided too. */
const FOOTBALL_WORDS: Record<string, PlayerSide> = {};
for (const [word, side] of Object.values(FOOTBALL)) FOOTBALL_WORDS[word] = side;
for (const [word, side] of [["offensive line", "offense"], ["offensive guard", "offense"], ["receiver", "offense"], ["lineman", "unknown"],
  ["defensive back", "defense"], ["defensive line", "defense"], ["end", "unknown"], ["back", "unknown"]] as [string, PlayerSide][]) FOOTBALL_WORDS[word] ??= side;

export const Positions = {
  /** "RB, MLB" → ["RB", "MLB"]; "MF/D" → ["MF", "D"]. Blank pieces are dropped. */
  split(raw: string): string[] {
    return raw.split(/[,/;|&]|\band\b/i).map((s) => s.trim()).filter(Boolean);
  },

  /** The full lowercase word for an abbreviation, or the input tidied when it is not one. */
  expand(raw: string, sport: string): string {
    const key = raw.trim();
    if (!key) return "";
    const upper = key.toUpperCase();
    if (sport === "football" && FOOTBALL[upper]) return FOOTBALL[upper][0];
    const table = OTHER[sport];
    if (table && table[upper]) return table[upper];
    // Already a word ("Running Back", "midfielder"): lowercase it unless it is an unknown code.
    return /^[A-Z0-9/-]{1,4}$/.test(key) ? key : key.toLowerCase();
  },

  /** Which unit a football position plays on. Anything not football, or not known, is unknown. */
  side(position: string, sport: string): PlayerSide {
    if (sport !== "football") return "unknown";
    const key = position.trim();
    if (!key) return "unknown";
    const abbr = FOOTBALL[key.toUpperCase()];
    if (abbr) return abbr[1];
    const lower = key.toLowerCase();
    if (FOOTBALL_WORDS[lower]) return FOOTBALL_WORDS[lower];
    // "left tackle", "outside linebacker", "nickel cornerback": the last word decides.
    const last = lower.split(/\s+/).pop() ?? "";
    for (const [word, side] of Object.entries(FOOTBALL_WORDS)) if (word.endsWith(last) && side !== "unknown") return side;
    return "unknown";
  },

  /**
   * A roster's printed position, expanded and split into the primary and (for two-way players)
   * the secondary position, each with its side.
   */
  parse(raw: string, sport: string): { position: string; side: PlayerSide; secondary: { position: string; side: PlayerSide } | null } {
    const pieces = Positions.split(raw).map((p) => ({ position: Positions.expand(p, sport), side: Positions.side(p, sport) })).filter((p) => p.position);
    if (!pieces.length) return { position: "", side: "unknown", secondary: null };
    const [first, ...rest] = pieces;
    // The second position matters when it is on the other unit; "WR, TE" is one offensive player.
    const other = rest.find((p) => p.side !== "unknown" && p.side !== first.side) ?? null;
    return { position: first.position, side: first.side, secondary: other };
  },
};
