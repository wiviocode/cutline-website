/**
 * The model, chosen by what it costs and how well it reads: every model in the catalogue with
 * its price for a thousand photographs at the detail in use, and what has been measured of it.
 * Cards on the welcome screen, a grouped list in Settings.
 */

import React from "react";
import { useStore } from "../store";
import { RadioCards, Select } from "../components";
import { VISION_MODELS, VisionModel, Cost, TIER_LABELS } from "@core/models/VisionModel";
import { Providers } from "@core/models/Providers";
import { Access } from "@core/models/VisionClient";

/**
 * Every model with what the screen says of it. The selectors pick stable state — the settings
 * object and the keys record — rather than building the access record inside the selector,
 * which would be a new object every render and never settle.
 */
function useModelRows() {
  const settings = useStore((s) => s.settings);
  const keys = useStore((s) => s.keys);
  const access = { keys, localBaseURL: settings.localBaseURL, localModel: settings.localModel };
  return VISION_MODELS.map((m) => {
    const ready = Access.ready(m, access);
    const name = m.provider === "local" && settings.localModel ? `${settings.localModel} on this Mac` : m.name;
    const perThousand = m.provider === "local" ? "free" : `${Cost.dollars(Cost.perThousand(m, settings.longEdge))} per 1,000`;
    return { m, ready, name, cost: Cost.label(m, settings.longEdge), perThousand, missing: Access.missing(m, access) };
  });
}

/** The welcome screen's choice: one card a model, the ones not set up greyed. */
export function ModelCards() {
  const value = useStore((s) => s.settings.model);
  const set = useStore((s) => s.setSetting);
  const rows = useModelRows();
  return (
    <RadioCards name="model" value={value} onChange={(v) => set({ model: v })}
      options={rows.map(({ m, ready, name, cost, missing }) => ({
        id: m.id, title: name, disabled: !ready,
        aside: `${TIER_LABELS[m.tier]} · ${cost}`,
        detail: <>{m.note}{!ready && <> <em>{missing?.replace(" in Settings first.", " to use it.")}</em></>}</>,
      }))} />
  );
}

/** Settings' choice: a list grouped by provider, the price beside each name. */
export function ModelSelect() {
  const value = useStore((s) => s.settings.model);
  const set = useStore((s) => s.setSetting);
  const rows = useModelRows();
  return (
    <Select value={value} ariaLabel="Model" onChange={(v) => set({ model: v })}
      options={rows.map(({ m, name, perThousand }) => ({ id: m.id, group: Providers.name(m.provider), name: `${name} — ${perThousand}` }))} />
  );
}

/** What the chosen model is, for the line under the list. */
export function ModelNote() {
  const rows = useModelRows();
  const value = useStore((s) => s.settings.model);
  const row = rows.find((r) => r.m.id === value) ?? rows.find((r) => r.m.id === VisionModel.default.id)!;
  return <>{TIER_LABELS[row.m.tier]} · {row.cost}. {row.m.note}{row.missing && <> <em>{row.missing}</em></>}</>;
}

export { React };
