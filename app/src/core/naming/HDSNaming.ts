/**
 * Filenames in the HDS convention, from `HDS Photo Naming.pages` (rev. 240228):
 *
 *     home game   (Initials)YYYYMMDD_SportCode_Home_v_Visit_{Sequence}.jpg
 *     away game   (Initials)YYYYMMDD_SportCode_Visit_at_Home_{Sequence}.jpg
 *
 *     JSP20230909_FB_NU_v_OS_0001.jpg
 *     JSP20230909_FB_NU_at_OS_0001.jpg
 *
 * Both worked examples lead with NU, because NU is the home side in the first and the visiting
 * side in the second. So the covered team comes first either way, and the connector says which
 * it was: `v` when they hosted, `at` when they travelled. The sequence resets every event.
 */

import type { Gender } from "../setup/GameLibrary";
import { TeamName } from "../roster/TeamName";

export interface Fixture {
  initials: string;
  date: Date;
  sportCode: string;
  /** The team being covered. */
  covered: string;
  opponent: string;
  /** True when the covered team was at home. */
  coveredIsHome: boolean;
}

/** A school's code, and whether it came from the document or was derived. */
export interface SchoolCode { code: string; isKnown: boolean }

/** The four conference tables from the document, verbatim. */
export const SCHOOL_CODES: Record<string, string> = {
  // Big Ten
  "Nebraska": "NU", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Maryland": "MD",
  "Michigan": "MI", "Michigan State": "MSU", "Minnesota": "MN", "Northwestern": "NW",
  "Ohio St": "OSU", "Ohio State": "OSU", "Oregon": "OR", "Penn State": "PS",
  "Purdue": "PU", "Rutgers": "RU", "UCLA": "UCLA", "USC": "USC", "Washington": "WA",
  "Wisconsin": "WI",
  // Summit
  "Omaha": "OMA", "South Dakota State": "SDST", "South Dakota": "USD", "Denver": "DEN",
  "North Dakota State": "NDS", "North Dakota": "UND", "Oral Roberts": "ORU",
  "St Thomas": "TOM", "Kansas City": "KC",
  // NCHC
  "Colorado College": "CC", "Duluth": "DUL", "St Cloud State": "SCS",
  "Western Michigan": "WM", "Miami": "MIA",
  // Big East
  "Creighton": "CU", "Butler": "BU", "UCONN": "UCONN", "DePaul": "DP",
  "Georgetown": "GTU", "Marquette": "MQ", "Providence": "PV", "St John's": "SJ",
  "Seton Hall": "SH", "Villanova": "VN", "Xavier": "XU",
  // Pro volleyball
  "Omaha Supernovas": "SN", "Atlanta Vibe": "VB", "Columbus Fury": "FR",
  "Grand Rapids Rise": "RS", "Orlando Valkyries": "VK", "San Diego Mojo": "MJ",
  "Vegas Thrill": "TH",
};

function normalise(s: string): string {
  // A hyphen or slash joins two names into one school — "Ashland-Greenwood" is two words.
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-–—/]/g, " ")
    .replace(/[^a-z0-9 ]/g, "").split(" ").filter(Boolean).join(" ");
}

const NORMALISED_CODES: Record<string, string> = Object.fromEntries(
  Object.entries(SCHOOL_CODES).map(([name, code]) => [normalise(name), code]),
);

export const HDSNaming = {
  /**
   * The document's own list, narrowed to the sports this app offers. Gendered sports take their
   * gendered code; football, volleyball, baseball, softball, cross country and track have one.
   */
  sportCode(sport: string, gender: Gender): string | null {
    const m = gender === "mens";
    switch (sport) {
      case "football":      return "FB";
      case "volleyball":    return "VB";
      case "baseball":      return "BB";
      case "softball":      return "SB";
      case "crossCountry":  return "CC";
      case "trackAndField": return "TF";
      case "soccer":        return m ? "MSOC" : "WSOC";
      case "basketball":    return m ? "MBB" : "WBB";
      case "golf":          return m ? "MGF" : "WGF";
      case "tennis":        return m ? "MTEN" : "WTEN";
      default:              return null;
    }
  },

  /**
   * A derived code is a guess and is marked as one, because a filename is the thing a desk
   * sorts and searches by — a silently wrong abbreviation is worse than an obvious one the
   * photographer corrects.
   */
  schoolCode(team: string): SchoolCode {
    const { school } = TeamName.split(team);
    for (const candidate of [team, school]) {
      const code = NORMALISED_CODES[normalise(candidate)];
      if (code) return { code, isKnown: true };
    }
    // Deriving from the split name is wrong for a two-word school with no nickname: "Notre
    // Dame" splits as school "Notre" plus nickname "Dame", which derived "NOT" instead of "ND".
    // Prefer the split name when it is itself more than one word, or when what came off the end
    // reads as a mascot — a plural, "Rockets", "Bluejays" — so "Syracuse Rockets" gives "SYR".
    const { nickname } = TeamName.split(team);
    const schoolWords = normalise(school).split(" ").filter(Boolean).length;
    const mascotLike = !!nickname && /s$/i.test(nickname) && nickname.length > 3;
    const basis = schoolWords > 1 || mascotLike ? school : team;
    return { code: derive(basis), isKnown: false };
  },

  /** "Eli Larson" -> "EL". A name already looking like initials is passed through. */
  initials(photographer: string): string {
    const trimmed = photographer.trim();
    if (!trimmed) return "";
    const words = trimmed.split(" ").filter(Boolean);
    if (words.length === 1) {
      const word = words[0];
      if (word.length <= 4 && word === word.toUpperCase()) return word; // already initials
      return word.slice(0, 2).toUpperCase();
    }
    return words.map((w) => w[0]).join("").toUpperCase();
  },

  /** `EL20260820_WSOC_NU_v_ND_0001.jpg` */
  filename(fixture: Fixture, sequence: number, extension: string): string {
    const covered = HDSNaming.schoolCode(fixture.covered).code;
    const opponent = HDSNaming.schoolCode(fixture.opponent).code;
    const connector = fixture.coveredIsHome ? "v" : "at";
    const number = String(Math.max(sequence, 0)).padStart(4, "0");
    const stem = `${fixture.initials}${HDSNaming.dateStamp(fixture.date)}_${fixture.sportCode}_${covered}_${connector}_${opponent}_${number}`;
    return extension ? `${stem}.${extension.toLowerCase()}` : stem;
  },

  /** `YYYYMMDD`, in the local calendar, because the date is the day of the game as a person would write it. */
  dateStamp(date: Date): string {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  },
};

/** Initials of each word for a multi-word name, otherwise the first three letters. */
function derive(school: string): string {
  const words = normalise(school).split(" ").filter(Boolean);
  if (words.length === 0) return "XX";
  if (words.length > 1) return words.map((w) => w[0]).join("").toUpperCase();
  return words[0].slice(0, 3).toUpperCase();
}
