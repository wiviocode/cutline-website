/**
 * Everything produced for one photo, persisted next to the shoot in `.caption-data/`.
 *
 * Saving the model's raw observation is what makes review cheap: a jersey number corrected by
 * hand re-composes the caption **locally**, with no second API call. The on-disk shape is the
 * native app's, so a folder captioned in one opens in the other.
 */

import { VisionResult } from "../vision/VisionResult";

export interface CaptionRecord {
  filename: string;
  imagePath: string;
  /** The vision model's structured observation, exactly as returned. */
  vision: VisionResult;
  /** Numbers supplied by a human during review, keyed by the player's index in `vision.players`. */
  manualJerseyNumbers: Record<number, string>;
  caption: string;
  altText: string | null;
  capturedAt: string | null;
  generatedAt: string;
  /**
   * Signed off by a human. A marker, not a gate: the caption reaches the file when it is
   * composed, and approving records that someone has since looked at it.
   */
  approved: boolean;
}

export const CaptionRecord = {
  make(p: Partial<CaptionRecord> & { filename: string; vision: VisionResult; caption: string }): CaptionRecord {
    return {
      filename: p.filename,
      imagePath: p.imagePath ?? p.filename,
      vision: p.vision,
      manualJerseyNumbers: p.manualJerseyNumbers ?? {},
      caption: p.caption,
      altText: p.altText ?? null,
      capturedAt: p.capturedAt ?? null,
      generatedAt: p.generatedAt ?? new Date().toISOString(),
      approved: p.approved ?? false,
    };
  },

  /**
   * Tolerant decoding, and it must stay that way. Each field added here would otherwise break
   * every record written before it — a whole shoot's captions failing to decode and reappearing
   * as uncaptioned.
   */
  fromJSON(o: unknown): CaptionRecord {
    if (!o || typeof o !== "object") throw new Error("not a caption record");
    const r = o as Record<string, unknown>;
    if (typeof r.filename !== "string" || typeof r.caption !== "string" || !r.vision) throw new Error("not a caption record");
    const manual: Record<number, string> = {};
    if (r.manualJerseyNumbers && typeof r.manualJerseyNumbers === "object") {
      for (const [k, v] of Object.entries(r.manualJerseyNumbers as Record<string, unknown>)) {
        if (typeof v === "string") manual[Number(k)] = v;
      }
    }
    return {
      filename: r.filename,
      imagePath: typeof r.imagePath === "string" ? r.imagePath : r.filename,
      vision: VisionResult.fromJSON(r.vision),
      manualJerseyNumbers: manual,
      caption: r.caption,
      altText: typeof r.altText === "string" ? r.altText : null,
      capturedAt: typeof r.capturedAt === "string" ? r.capturedAt : null,
      generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : new Date().toISOString(),
      approved: r.approved === true,
    };
  },

  toJSON(rec: CaptionRecord): Record<string, unknown> {
    const manual: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec.manualJerseyNumbers)) manual[k] = v;
    return {
      filename: rec.filename,
      imagePath: rec.imagePath,
      vision: VisionResult.toJSON(rec.vision),
      manualJerseyNumbers: manual,
      caption: rec.caption,
      altText: rec.altText,
      capturedAt: rec.capturedAt,
      generatedAt: rec.generatedAt,
      approved: rec.approved,
    };
  },

  /** True when the model saw a player but could not read the number. */
  needsReview(rec: CaptionRecord): boolean {
    return rec.vision.players.some((p, idx) => !p.jerseyNumber.trim() && rec.manualJerseyNumbers[idx] == null);
  },

  /** The observation with any human corrections applied. */
  correctedVision(rec: CaptionRecord): VisionResult {
    const entries = Object.entries(rec.manualJerseyNumbers);
    if (entries.length === 0) return rec.vision;
    const v: VisionResult = { ...rec.vision, players: rec.vision.players.map((p) => ({ ...p, flags: [...p.flags] })) };
    for (const [k, number] of entries) {
      const idx = Number(k);
      if (idx < v.players.length) {
        v.players[idx].jerseyNumber = number;
        v.players[idx].flags = v.players[idx].flags.filter((f) => f !== "unreadable_number");
      }
    }
    // A corrected pair can now form an interaction the composer could not build before.
    if (v.interaction) {
      const i = { ...v.interaction };
      if (!i.subjectJerseyNumber) {
        const first = v.players.find((p) => p.jerseyColor === i.subjectJerseyColor);
        if (first) i.subjectJerseyNumber = first.jerseyNumber;
      }
      if (!i.targetJerseyNumber) {
        const t = v.players.find((p) => p.jerseyColor === i.targetJerseyColor);
        if (t) i.targetJerseyNumber = t.jerseyNumber;
      }
      v.interaction = i;
    }
    return v;
  },

  /** `.caption-data/<stem>.json` */
  recordName(imageName: string): string {
    const dot = imageName.lastIndexOf(".");
    return `${dot > 0 ? imageName.slice(0, dot) : imageName}.json`;
  },
  directoryName: ".caption-data",
};

/** Which frames to work through. */
export type ReviewStatus = "needsReview" | "approved" | "all";
export const REVIEW_STATUSES: { id: ReviewStatus; label: string }[] = [
  { id: "needsReview", label: "Needs review" },
  { id: "approved",    label: "Approved" },
  { id: "all",         label: "All" },
];
