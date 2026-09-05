/**
 * The desk's per-shoot metadata fields.
 *
 * Hurrdat's IPTC sheet lists a handful of fields that change from game to game — the descriptor,
 * the sport code, and where it was played. A Photo Mechanic template cannot hold them, because a
 * template is one saved set of literal strings: the one shipped with this app said
 * `Nebraska Football v Opponent - 2026-08-25` on every frame of every shoot until it was
 * hand-edited. The app already knows all of it from the setup screen, so it fills them in.
 */

import type { Gender } from "../setup/GameLibrary";

export interface HurrdatFields {
  /** One string, used in the Headline, Title and Event fields. */
  descriptor: string;
  /** IPTC category. "S" for sport — everything this app captions. */
  category: string;
  /** The desk's sport code, or null for a sport its sheet does not list. */
  supplementalCategory: string | null;
  city: string;
  state: string;
  /** The venue, which Photo Mechanic shows as "Location". */
  sublocation: string;
}

export const HurrdatFields = {
  /**
   * Stands in for the date until the packet is built. A descriptor is made once for the shoot but
   * its date belongs to the photograph, so the writer substitutes each frame's own capture date.
   */
  datePlaceholder: "{date}",

  make(f: Partial<HurrdatFields> & { descriptor: string }): HurrdatFields {
    return {
      descriptor: f.descriptor,
      category: f.category ?? "S",
      supplementalCategory: f.supplementalCategory ?? null,
      city: f.city ?? "",
      state: f.state ?? "",
      sublocation: f.sublocation ?? "",
    };
  },

  /**
   * `Nebraska Volleyball v Creighton - 2026-08-27`, the form on the desk's sheet.
   *
   * School names without the nickname: their example is "Nebraska v Creighton", not "Nebraska
   * Cornhuskers v Creighton Bluejays". An event with no opponent drops the `v` half rather than
   * naming a blank team.
   */
  descriptor(home: string, sport: string, away: string, date: string): string {
    home = home.trim(); away = away.trim(); sport = sport.trim(); date = date.trim();
    let subject = [home, sport].filter(Boolean).join(" ");
    if (away) subject = subject ? `${subject} v ${away}` : away;
    if (!date) return subject;
    return subject ? `${subject} - ${date}` : date;
  },

  /**
   * The desk's Supp Cat 1 code, or null where its sheet gives none.
   *
   * The sheet lists four: `FB` college football, `VOL` volleyball, `MBB` college basketball,
   * `WBB` women's college basketball. Nothing is invented for the sports it omits — a code the
   * desk does not recognise is worse in their system than an empty field.
   */
  supplementalCategory(sport: string, gender: Gender): string | null {
    switch (sport.toLowerCase()) {
      case "football":   return "FB";
      case "volleyball": return "VOL";
      case "basketball": return gender === "womens" ? "WBB" : "MBB";
      default:           return null;
    }
  },

  /** `20260827` as EXIF gives it, to `2026-08-27` as the descriptor wants it. */
  isoDate(fromIPTC: string): string | null {
    const d = fromIPTC.replace(/\D/g, "");
    if (d.length !== 8) return null;
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  },
};
