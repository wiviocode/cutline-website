import { useState } from "react";
import { Field, TextInput } from "../components";
import { TemplateBuilder, type DeskFields } from "@core/metadata/TemplateBuilder";

/** The fields almost every desk fills in; the rest wait behind "More fields". */
const BASIC: (keyof DeskFields)[] = ["credit", "copyright", "source", "email", "phone", "website"];

export interface TemplateDraft { name: string; fields: DeskFields }

/** A starting template from the byline: "Eli Larson/Hurrdat Sports", "© 2026 Hurrdat Sports". */
export function draftTemplate(photographer: string, house: string): TemplateDraft {
  const { name, ...fields } = TemplateBuilder.suggest({ photographer, house });
  return { name, fields };
}

/**
 * A basic IPTC template — the standing fields written into every photograph under the caption:
 * credit, copyright, source and how to reach the photographer. Saved like a Photo Mechanic
 * stationery pad, and read back the same way.
 */
export function TemplateForm({ draft, onChange, taken }: { draft: TemplateDraft; onChange: (d: TemplateDraft) => void; taken?: boolean }) {
  const [more, setMore] = useState(false);
  const specs = TemplateBuilder.fields.filter((f) => more || BASIC.includes(f.id));
  const set = (id: keyof DeskFields, v: string) => onChange({ ...draft, fields: { ...draft.fields, [id]: v } });
  return (
    <div className="template-form">
      <div className="grid-2">
        <Field label="Template name" hint={taken ? "A template with that name is saved already; saving replaces it." : undefined}>
          <TextInput value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} aria-label="Template name" />
        </Field>
        {specs.map((spec) => (
          <Field key={spec.id} label={spec.label} wide={spec.multiline}>
            {spec.multiline
              ? <textarea className="input textarea" rows={2} placeholder={spec.placeholder} value={draft.fields[spec.id] ?? ""} onChange={(e) => set(spec.id, e.target.value)} aria-label={spec.label} />
              : <TextInput placeholder={spec.placeholder} value={draft.fields[spec.id] ?? ""} onChange={(e) => set(spec.id, e.target.value)} aria-label={spec.label} />}
          </Field>
        ))}
      </div>
      <button type="button" className="link small" onClick={() => setMore((m) => !m)}>{more ? "Fewer fields" : "More fields: usage terms, instructions, job title"}</button>
      <p className="muted small">Blank fields are left out. Your name reaches every photograph as the creator; the headline, place and caption are written over this for each shoot.</p>
    </div>
  );
}
