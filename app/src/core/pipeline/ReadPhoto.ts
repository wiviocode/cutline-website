/**
 * Reading one photograph, start to finish: one look at the frame, the identities checked
 * against the roster, and — only where a number was left unsettled — a close look at a crop of
 * the original at full resolution.
 *
 * The close look is where accuracy is bought cheaply. A 45-megapixel frame sent at 3,000 visual
 * tokens puts a distant player's number in a few dozen pixels; the same number cropped from the
 * original fills the crop. It costs a sliver of the first look and runs for perhaps one frame in
 * five.
 */

import type { Claude, SentImage } from "../ai/Claude";
import { MODELS, TIERS, Usage, type Tier } from "../ai/Models";
import { Matchup, Team, type Matchup as MatchupT } from "../roster/Roster";
import { Identify, type Identity, type IdentifyContext } from "../vision/Identify";
import { Prompt } from "../vision/Prompt";
import { Crop, resizedSize, type Box } from "../vision/ImageSize";
import type { Observation, Subject } from "../vision/Observation";

/** Where a photograph's pixels come from: a File in the browser, a path under Node. */
export interface PhotoSource {
  name: string;
  /** The original's size after EXIF orientation. */
  size(): Promise<{ width: number; height: number }>;
  /** The whole frame, resized to exactly this size. */
  frame(width: number, height: number): Promise<SentImage>;
  /** A region of the original, resized to fit these limits. */
  crop(box: Box, maxEdge: number, maxTokens: number): Promise<SentImage>;
}

export interface ZoomLook {
  subjectId: string;
  before: { number: string; clarity: Subject["clarity"] };
  after: { number: string; clarity: Subject["clarity"] };
}

export interface PhotoReading {
  observation: Observation;
  identities: Identity[];
  usage: Usage;
  model: string;
  /** The size the frame was sent at, which the model's boxes are measured against. */
  sent: { width: number; height: number };
  original: { width: number; height: number };
  zooms: ZoomLook[];
}

export interface ReadOptions {
  claude: Claude;
  tier: Tier;
  /** The shoot's cached system prompt. */
  system: string;
  identify: IdentifyContext;
  source: PhotoSource;
  note?: string | null;
  hint?: string | null;
  sportName: string;
  /** Overrides the tier's model (a retry after a refusal, an evaluation). */
  model?: string;
  imageTokens?: number;
  zoom?: boolean;
}

/** At most this many close looks per photograph. */
const MAX_ZOOMS = 2;

export async function readPhoto(o: ReadOptions): Promise<PhotoReading> {
  const tier = TIERS[o.tier];
  const model = o.model ?? tier.model;
  const info = MODELS[model];
  const budget = Math.min(o.imageTokens ?? tier.imageTokens, info.maxImageTokens);
  const original = await o.source.size();
  const [w, h] = resizedSize(original.width, original.height, info.maxEdge, budget);
  const image = await o.source.frame(w, h);

  const first = await o.claude.observe({ model, system: o.system, image, text: Prompt.photoText({ name: o.source.name, note: o.note, hint: o.hint }) });
  let usage = first.usage;
  const observation = first.observation;
  let identities = Identify.all(observation, o.identify);
  const zooms: ZoomLook[] = [];

  if (o.zoom ?? tier.zoom) {
    const candidates = observation.subjects
      .filter((s) => s.box && s.kind === "athlete" && worthZooming(s, identities.find((i) => i.subjectId === s.id), { width: w, height: h }))
      .slice(0, MAX_ZOOMS);
    for (const s of candidates) {
      const crop = Crop.around(s.box!, { width: w, height: h }, original);
      // Nothing gained by a crop that is not sharper than what was already sent.
      if ((crop.x2 - crop.x1) / original.width > 0.6) continue;
      try {
        const img = await o.source.crop(crop, 1024, 1200);
        const team = teamFor(s, o.identify.matchup);
        const read = await o.claude.readNumber({
          model, image: img, sport: o.sportName, team: team ? Team.fullName(team) : "",
          candidates: team ? [...new Set(team.players.map((p) => p.number).filter(Boolean))] : [],
        });
        usage = Usage.add(usage, read.usage);
        const before = { number: s.number, clarity: s.clarity };
        // A crop around one player can take in the teammate beside them. A number another
        // subject on the same team already wears is theirs, not this player's.
        const taken = observation.subjects.some((o) => o !== s && o.team === s.team && o.number === read.number && o.clarity !== "hidden");
        // The close look wins when it saw at least as much. A clear first read it contradicts is
        // demoted to partial, so the disagreement reaches a person instead of the caption.
        if (!taken && read.clarity === "clear") {
          s.number = read.number;
          s.clarity = "clear";
          if (read.number !== before.number) s.player = "";
        } else if (!taken && read.clarity === "partial" && s.clarity !== "clear") {
          s.number = read.number;
          s.clarity = "partial";
          if (read.number !== before.number) s.player = "";
        } else if (before.clarity === "clear" && read.number && read.number !== before.number) {
          s.clarity = "partial";
        }
        zooms.push({ subjectId: s.id, before, after: { number: s.number, clarity: s.clarity } });
      } catch {
        // A failed close look leaves the first reading as it was.
      }
    }
    if (zooms.length) identities = Identify.all(observation, o.identify);
  }

  return { observation, identities, usage, model, sent: { width: w, height: h }, original, zooms };
}

function teamFor(s: Subject, m: MatchupT | null): Team | null {
  if (!m) return null;
  return s.team === "A" || s.team === "B" ? Matchup.team(m, s.team) : null;
}

/**
 * A close look is worth it when the first look left the number unsettled and there is room to
 * see more: a partial read, a clear read that matches nobody, or no read at all on a player who
 * was small in the frame (distance, not a turned back, is what hid the digits).
 */
function worthZooming(s: Subject, id: Identity | undefined, sent: { width: number; height: number }): boolean {
  if (!id) return false;
  const area = s.box ? ((s.box[2] - s.box[0]) * (s.box[3] - s.box[1])) / (sent.width * sent.height) : 1;
  const small = area > 0 && area < 0.035;
  // A distant player's "clear" number is a few dozen pixels high in the frame that was sent;
  // it is checked against the original before it is believed, unless a nameplate agreed.
  if (id.status === "confirmed") return small && !/nameplate/.test(id.reason);
  if (s.clarity === "partial") return true;
  if (s.clarity === "clear" && !id.player) return true;
  if (s.clarity === "hidden") return area > 0 && area < 0.06;
  return false;
}
