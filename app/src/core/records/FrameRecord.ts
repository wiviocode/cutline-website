/**
 * What is kept beside each photograph in `.caption-data/<stem>.json`: the model's reading, the
 * photographer's corrections and the caption. Reopening a folder restores all of it without a
 * second request — the reading is paid for once.
 *
 * Records written by the first Cutline (no version field, a `vision` object) are read for their
 * caption and review state only; the photograph can be read again to get subjects to correct.
 */

import { Observation } from "../vision/Observation";
import type { ManualID } from "../vision/Identify";
import type { ZoomLook } from "../pipeline/ReadPhoto";

export interface FrameRecord {
  version: 2;
  filename: string;
  observation: Observation | null;
  sent: { width: number; height: number } | null;
  original: { width: number; height: number } | null;
  zooms: ZoomLook[];
  model: string | null;
  dollars: number;
  manual: Record<string, ManualID>;
  note: string;
  caption: string;
  /** The caption was typed by hand and is kept over what the reading would compose. */
  captionEdited: boolean;
  approved: boolean;
  /** On-device face matches, when face matching was on. */
  faceHints?: Record<string, { playerID: string; distance: number }[]>;
  generatedAt: string;
}

export const FrameRecord = {
  folder: ".caption-data",

  pathFor(imageName: string): string {
    const dot = imageName.lastIndexOf(".");
    return `${dot > 0 ? imageName.slice(0, dot) : imageName}.json`;
  },

  serialise(r: FrameRecord): string {
    return JSON.stringify({ ...r, observation: r.observation ? Observation.toJSON(r.observation) : null }, null, 2);
  },

  parse(text: string, imageName: string): FrameRecord | null {
    let raw: Record<string, unknown>;
    try { raw = JSON.parse(text); } catch { return null; }
    if (!raw || typeof raw !== "object") return null;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    if (raw.version === 2) {
      return {
        version: 2,
        filename: imageName,
        observation: raw.observation ? Observation.fromJSON(raw.observation) : null,
        sent: (raw.sent as FrameRecord["sent"]) ?? null,
        original: (raw.original as FrameRecord["original"]) ?? null,
        zooms: Array.isArray(raw.zooms) ? (raw.zooms as ZoomLook[]) : [],
        model: str(raw.model) || null,
        dollars: typeof raw.dollars === "number" ? raw.dollars : 0,
        manual: (raw.manual as Record<string, ManualID>) ?? {},
        note: str(raw.note),
        caption: str(raw.caption),
        captionEdited: !!raw.captionEdited,
        approved: !!raw.approved,
        faceHints: (raw.faceHints as FrameRecord["faceHints"]) ?? {},
        generatedAt: str(raw.generatedAt),
      };
    }
    // The first Cutline's record: keep what the photographer approved or typed.
    if (typeof raw.caption === "string") {
      return {
        version: 2, filename: imageName, observation: null, sent: null, original: null, zooms: [], model: null, dollars: 0,
        manual: {}, note: "", caption: raw.caption, captionEdited: true, approved: !!raw.approved, generatedAt: str(raw.generatedAt),
      };
    }
    return null;
  },
};
