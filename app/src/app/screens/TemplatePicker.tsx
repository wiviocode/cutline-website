/**
 * The desk's IPTC template — a .XMP stationery pad exported from Photo Mechanic — chosen once in
 * the first-time setup and changeable in Settings. One control in both places, so they cannot
 * drift apart.
 */

import React, { useRef, useState } from "react";
import { useStore } from "../store";
import { Button, Select } from "../components";
import { TemplateBuilderSheet } from "./TemplateBuilderSheet";

export function TemplatePicker() {
  const templateName = useStore((s) => s.settings.templateName);
  const names = useStore((s) => s.templateNames);
  const set = useStore((s) => s.setSetting);
  const addTemplate = useStore((s) => s.addTemplate);
  const removeTemplate = useStore((s) => s.removeTemplate);
  const input = useRef<HTMLInputElement>(null);
  const [making, setMaking] = useState(false);
  return (
    <>
      <Select value={templateName ?? ""} ariaLabel="IPTC template" onChange={(v) => set({ templateName: v || null })}
        options={[{ id: "", name: names.length ? "None" : "None yet" }, ...names.map((n) => ({ id: n, name: n }))]} />
      <Button variant="secondary" onClick={() => setMaking(true)}>Make one…</Button>
      <Button variant="secondary" onClick={() => input.current?.click()} title="A .XMP stationery pad exported from Photo Mechanic">Add a .XMP…</Button>
      {templateName && <button type="button" className="linky" onClick={() => void removeTemplate(templateName)}>Remove</button>}
      {making && <TemplateBuilderSheet onClose={() => setMaking(false)} />}
      <input ref={input} type="file" accept=".xmp,.XMP,text/xml,application/xml" hidden aria-hidden="true"
        onChange={async (e) => { const f = e.target.files?.[0]; if (f) await addTemplate(f.name, await f.text()); e.target.value = ""; }} />
    </>
  );
}

export { React };
