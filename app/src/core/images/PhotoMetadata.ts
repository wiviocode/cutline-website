/**
 * What the photograph itself says: when it was taken and what took it.
 *
 * Matters because an IPTC template carries a *static* `photoshop:DateCreated` — the date the
 * template was authored. Stamping that onto every frame of a later shoot is silently wrong, so
 * the per-photo capture time is read and substituted. Reading it (from EXIF, via `exifr`) is a
 * platform concern; the derived forms here are pure.
 */

export interface PhotoMetadata {
  captureDate?: Date;
  cameraMake?: string;
  cameraModel?: string;
  bodySerialNumber?: string;
  pixelWidth?: number;
  pixelHeight?: number;
}

const AP_MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const PhotoMetadata = {
  empty(): PhotoMetadata { return {}; },

  /** `2026-08-21` — the form Photo Mechanic writes into `photoshop:DateCreated`. */
  iptcDateCreated(m: PhotoMetadata): string | null {
    return m.captureDate ? isoDay(m.captureDate) : null;
  },

  /**
   * `Aug. 21, 2026` — AP style, for the caption's date clause. AP abbreviates all months except
   * March through July, which are spelled in full.
   */
  apStyleDate(m: PhotoMetadata): string | null {
    const d = m.captureDate;
    if (!d) return null;
    return `${AP_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  },

  /**
   * `Saturday` — the weekday Hurrdat's template sets before the date. Always English regardless
   * of the machine's locale.
   */
  weekdayName(m: PhotoMetadata): string | null {
    return m.captureDate ? WEEKDAYS[m.captureDate.getDay()] : null;
  },

  /** Parse EXIF's `yyyy:MM:dd HH:mm:ss` into a local Date. */
  parseExifDate(raw: string | undefined | null): Date | undefined {
    if (!raw) return undefined;
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
    if (!m) return undefined;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return isNaN(d.getTime()) ? undefined : d;
  },
};

export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** A local-calendar date, built without timezone surprises. */
export function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0);
}
