/**
 * The three ways a US state gets written in a wire caption.
 *
 * AP's abbreviations are their own thing and are not postal codes — "Neb.", not "NE" — and eight
 * states are never abbreviated at all. Getty and Icon spell the state out; Imagn uses the postal
 * code followed by ", USA". A photographer types one of these into the setup screen, so every
 * form has to be recognised whichever was typed.
 */

import type { StateForm } from "./WireStyle";

/** full name, AP abbreviation, postal code. */
const TABLE: [string, string, string][] = [
  ["Alabama", "Ala.", "AL"], ["Alaska", "Alaska", "AK"], ["Arizona", "Ariz.", "AZ"],
  ["Arkansas", "Ark.", "AR"], ["California", "Calif.", "CA"], ["Colorado", "Colo.", "CO"],
  ["Connecticut", "Conn.", "CT"], ["Delaware", "Del.", "DE"],
  ["District of Columbia", "D.C.", "DC"], ["Florida", "Fla.", "FL"],
  ["Georgia", "Ga.", "GA"], ["Hawaii", "Hawaii", "HI"], ["Idaho", "Idaho", "ID"],
  ["Illinois", "Ill.", "IL"], ["Indiana", "Ind.", "IN"], ["Iowa", "Iowa", "IA"],
  ["Kansas", "Kan.", "KS"], ["Kentucky", "Ky.", "KY"], ["Louisiana", "La.", "LA"],
  ["Maine", "Maine", "ME"], ["Maryland", "Md.", "MD"], ["Massachusetts", "Mass.", "MA"],
  ["Michigan", "Mich.", "MI"], ["Minnesota", "Minn.", "MN"],
  ["Mississippi", "Miss.", "MS"], ["Missouri", "Mo.", "MO"], ["Montana", "Mont.", "MT"],
  ["Nebraska", "Neb.", "NE"], ["Nevada", "Nev.", "NV"],
  ["New Hampshire", "N.H.", "NH"], ["New Jersey", "N.J.", "NJ"],
  ["New Mexico", "N.M.", "NM"], ["New York", "N.Y.", "NY"],
  ["North Carolina", "N.C.", "NC"], ["North Dakota", "N.D.", "ND"],
  ["Ohio", "Ohio", "OH"], ["Oklahoma", "Okla.", "OK"], ["Oregon", "Ore.", "OR"],
  ["Pennsylvania", "Pa.", "PA"], ["Rhode Island", "R.I.", "RI"],
  ["South Carolina", "S.C.", "SC"], ["South Dakota", "S.D.", "SD"],
  ["Tennessee", "Tenn.", "TN"], ["Texas", "Texas", "TX"], ["Utah", "Utah", "UT"],
  ["Vermont", "Vt.", "VT"], ["Virginia", "Va.", "VA"], ["Washington", "Wash.", "WA"],
  ["West Virginia", "W.Va.", "WV"], ["Wisconsin", "Wis.", "WI"], ["Wyoming", "Wyo.", "WY"],
];

function row(typed: string): [string, string, string] | null {
  const key = typed.trim().toLowerCase();
  if (!key) return null;
  return TABLE.find(([full, ap, postal]) => full.toLowerCase() === key || ap.toLowerCase() === key || postal.toLowerCase() === key) ?? null;
}

export const USState = {
  /** Rewrite whatever the photographer typed into the form this desk wants. Unrecognised input is returned untouched. */
  written(typed: string, form: StateForm): string {
    const r = row(typed);
    if (!r) return typed;
    return form === "apAbbreviation" ? r[1] : form === "fullName" ? r[0] : r[2];
  },
};

/** Accepts a full name ("Nebraska") or a postal code ("NE") and returns AP form ("Neb."). */
export const APState = {
  neverAbbreviated: new Set(["Alaska", "Hawaii", "Idaho", "Iowa", "Maine", "Ohio", "Texas", "Utah"]),
  apStyle(input: string): string {
    const s = input.trim();
    if (!s) return s;
    const r = s.length === 2 ? TABLE.find(([, , postal]) => postal === s.toUpperCase()) : TABLE.find(([full]) => full === s);
    if (!r) return s;
    return r[1];
  },
};
