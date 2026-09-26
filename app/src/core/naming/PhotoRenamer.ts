/**
 * Renaming a shoot's frames to the convention — the planning half.
 *
 * A photo is not one file. It has a sidecar beside it and a caption record in `.caption-data`,
 * both keyed on its stem, and a rename that moves only the JPEG silently detaches the caption
 * from the photograph. Applying the plan touches the disk, so it lives in the platform layer;
 * every decision about *what* moves is made here, where it can be checked.
 */

import { NamingPattern } from "./NamingPattern";
import type { Fixture } from "./HDSNaming";

export interface Companion { from: string; to: string; kind: "sidecar" | "caption data" }

/** One frame's move, with everything that travels with it. Names, not paths — all within one folder. */
export interface RenameItem {
  source: string;
  destination: string;
  companions: Companion[];
}

export interface RenamePlan {
  items: RenameItem[];
  /** Reasons the plan cannot be run, in the order they were found. */
  problems: string[];
}

export const stem = (name: string) => { const d = name.lastIndexOf("."); return d > 0 ? name.slice(0, d) : name; };
export const extension = (name: string) => { const d = name.lastIndexOf("."); return d > 0 ? name.slice(d + 1) : ""; };

export const PhotoRenamer = {
  /**
   * Work out every move, and refuse rather than half-apply.
   *
   * Sequence numbers are assigned over the frames **in the order given**, which the caller sorts
   * by capture time, so the numbering follows the game rather than the card's old filenames.
   */
  plan(opts: {
    photos: string[];
    fixture: Fixture;
    pattern?: string;
    startingAt?: number;
    /** Every name in the folder, so a destination that would overwrite something can be refused. */
    existingNames: Set<string>;
    /** Names inside `.caption-data`. */
    recordNames?: Set<string>;
  }): RenamePlan {
    const pattern = opts.pattern ?? NamingPattern.hurrdat;
    const first = opts.startingAt ?? 1;
    const items: RenameItem[] = [];
    const problems: string[] = [];
    const destinations = new Set<string>();

    opts.photos.forEach((photo, offset) => {
      const ext = extension(photo);
      const name = NamingPattern.filename(pattern, opts.fixture, first + offset, ext);
      if (destinations.has(name)) problems.push(`Two frames would both become ${name}.`);
      destinations.add(name);

      const companions: Companion[] = [];
      const sidecar = `${stem(photo)}.xmp`;
      if (opts.existingNames.has(sidecar)) companions.push({ from: sidecar, to: `${stem(name)}.xmp`, kind: "sidecar" });
      const record = `${stem(photo)}.json`;
      if (opts.recordNames?.has(record)) companions.push({ from: record, to: `${stem(name)}.json`, kind: "caption data" });

      items.push({ source: photo, destination: name, companions });
    });

    // A destination that already exists and is not itself being moved would be overwritten.
    const sources = new Set(opts.photos);
    for (const item of items) {
      if (item.source === item.destination) continue;
      if (opts.existingNames.has(item.destination) && !sources.has(item.destination)) {
        problems.push(`${item.destination} already exists.`);
      }
    }
    if (!opts.fixture.initials) problems.push("Set a photographer in Settings — the name starts with your initials.");
    return { items, problems };
  },

  changing(plan: RenamePlan): RenameItem[] { return plan.items.filter((i) => i.source !== i.destination); },
  isRunnable(plan: RenamePlan): boolean { return plan.problems.length === 0 && PhotoRenamer.changing(plan).length > 0; },
};
