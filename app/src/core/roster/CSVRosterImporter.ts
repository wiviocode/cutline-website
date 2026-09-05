/**
 * Imports a roster from CSV.
 *
 * Column contract: `jersey` (required — `jersey`, `number`, `num`, `no`, `uniform`); either a
 * full name (`name`, `player`, `full_name`, `fullname`) or first + last; optional `pos`/`position`;
 * optional `role` ∈ player | coach | referee | staff | other. Column names are case-insensitive;
 * empty rows are skipped; a row with no jersey number is skipped; full name wins when both forms
 * are present; role defaults to `player`.
 */

import type { RosterRole } from "./Roster";

export interface CSVPlayer {
  jerseyNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  position: string;
  role: RosterRole;
}

export class CSVImportError extends Error {
  constructor(public readonly kind: "emptyFile" | "missingJerseyColumn" | "missingNameColumns") {
    super(kind === "emptyFile" ? "The file is empty"
      : kind === "missingJerseyColumn" ? "No jersey-number column (jersey, number, num, no, uniform)"
      : "No name columns (name, or first and last)");
    this.name = "CSVImportError";
  }
}

const JERSEY = ["jersey", "number", "num", "no", "uniform"];
const FULL = ["name", "player", "full_name", "fullname"];
const FIRST = ["first", "first_name", "fname", "givenname", "given"];
const LAST = ["last", "last_name", "lname", "surname", "family"];
const POSITION = ["pos", "position"];
const ROLE = ["role"];
const ROLES: RosterRole[] = ["player", "coach", "referee", "staff", "other"];

export const CSVRosterImporter = {
  import(csv: string): { players: CSVPlayer[]; skippedRows: number } {
    const rows = parse(csv);
    if (rows.length < 2) throw new CSVImportError("emptyFile");
    const header = rows[0];
    const index = new Map<string, number>();
    header.forEach((h, i) => { if (!index.has(h.trim().toLowerCase())) index.set(h.trim().toLowerCase(), i); });
    const column = (aliases: string[]) => { for (const a of aliases) { const i = index.get(a); if (i !== undefined) return i; } return undefined; };

    const jerseyCol = column(JERSEY);
    if (jerseyCol === undefined) throw new CSVImportError("missingJerseyColumn");
    const fullCol = column(FULL), firstCol = column(FIRST), lastCol = column(LAST);
    if (fullCol === undefined && (firstCol === undefined || lastCol === undefined)) throw new CSVImportError("missingNameColumns");
    const posCol = column(POSITION), roleCol = column(ROLE);

    const players: CSVPlayer[] = [];
    let skipped = 0;
    for (const row of rows.slice(1)) {
      if (row.every((c) => !c.trim())) { skipped++; continue; }
      const field = (i: number | undefined) => (i === undefined || i >= row.length ? "" : row[i].trim());
      const jersey = field(jerseyCol);
      if (!jersey) { skipped++; continue; }

      let first = field(firstCol), last = field(lastCol);
      let full: string;
      if (fullCol !== undefined && field(fullCol)) {
        full = field(fullCol);
        const sp = full.indexOf(" ");
        first = sp < 0 ? full : full.slice(0, sp);
        last = sp < 0 ? "" : full.slice(sp + 1);
      } else {
        full = [first, last].filter(Boolean).join(" ");
      }
      const roleText = field(roleCol).toLowerCase();
      const role = (ROLES as string[]).includes(roleText) ? (roleText as RosterRole) : "player";
      players.push({ jerseyNumber: jersey, firstName: first, lastName: last, fullName: full, position: field(posCol), role });
    }
    return { players, skippedRows: skipped };
  },
};

/** RFC 4180-ish parser: quoted fields, escaped quotes, CRLF. */
export function parse(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === "\"") {
        if (text[i + 1] === "\"") { field += "\""; i++; } else inQuotes = false;
      } else field += c;
    } else {
      if (c === "\"") inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* handled by the \n that follows */ }
      else field += c;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && !r[0].trim()));
}
