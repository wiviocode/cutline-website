/**
 * Making an IPTC template in the app: the desk's standing fields in a short form, saved as a
 * template the picker then offers. Opened from the template control in the first-time setup and
 * in Settings.
 */

import React, { useState } from "react";
import { useStore } from "../store";
import { Button, Callout, Field, Sheet, TextArea, TextInput } from "../components";
import { TemplateBuilder, type DeskFields } from "@core/metadata/TemplateBuilder";

export function TemplateBuilderSheet({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const names = useStore((s) => s.templateNames);
  const addTemplate = useStore((s) => s.addTemplate);
  const [seed] = useState(() => TemplateBuilder.suggest(settings));
  const [name, setName] = useState(seed.name);
  const [fields, setFields] = useState<DeskFields>(() => { const { name: _n, ...rest } = seed; return rest; });
  const [saving, setSaving] = useState(false);
  const trimmed = name.trim();
  const taken = names.includes(trimmed);
  const can = trimmed !== "" && !taken && TemplateBuilder.hasContent(fields) && !saving;

  const save = async () => {
    if (!can) return;
    setSaving(true);
    await addTemplate(trimmed, TemplateBuilder.build(fields));
    setSaving(false);
    onClose();
  };

  return (
    <Sheet title="Make an IPTC template" onClose={onClose} busy={saving}
      footer={<><span className="dim small">Blank fields are left out. The By-line comes from your name in Settings.</span><span className="spacer" /><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!can} onClick={() => void save()}>{saving ? "Saving…" : "Save template"}</Button></>}>
      <p className="lede" style={{ marginTop: 0 }}>The standing fields your desk puts on every photograph. They are written into each frame under the caption, and the per-shoot fields — headline, place, codes — go over them.</p>
      <div className="card stack">
        <Field label="Template name" hint={taken ? "A template with that name is already saved — pick another." : "How it appears in the template list."}>
          <TextInput value={name} autoFocus onChange={(e) => setName(e.target.value)} ariaLabel="Template name" />
        </Field>
        {TemplateBuilder.fields.map((spec) => (
          <Field key={spec.id} label={spec.label} hint={spec.hint}>
            {spec.multiline
              ? <TextArea value={fields[spec.id] ?? ""} rows={2} minHeight={54} placeholder={spec.placeholder} ariaLabel={spec.label} onChange={(e) => setFields({ ...fields, [spec.id]: e.target.value })} />
              : <TextInput value={fields[spec.id] ?? ""} placeholder={spec.placeholder} ariaLabel={spec.label} onChange={(e) => setFields({ ...fields, [spec.id]: e.target.value })} />}
          </Field>
        ))}
      </div>
      {taken && <Callout kind="warn">Saving would replace the template called "{trimmed}". Give this one a different name.</Callout>}
    </Sheet>
  );
}

export { React };
