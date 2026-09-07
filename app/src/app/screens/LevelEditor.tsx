/**
 * A level of the desk's own — a prep-school league, a masters circuit, a conference it covers —
 * named, given the phrase a caption will use for it, and told which kind of thing it is so the
 * right sports and the right words for the sides follow.
 */

import React, { useState } from "react";
import { useStore } from "../store";
import { Button, Field, RadioCards, Sheet, TextInput } from "../components";
import { LEVEL_KINDS, type LevelKind } from "@core/setup/Levels";
import { Article } from "@core/caption/Article";

export function LevelEditor({ onClose }: { onClose: () => void }) {
  const addLevel = useStore((s) => s.addLevel);
  const [label, setLabel] = useState("");
  const [phrase, setPhrase] = useState("");
  const [kind, setKind] = useState<LevelKind>("college");
  const qualifier = phrase.trim() || label.trim().toLowerCase();
  const example = qualifier ? `during ${Article.before(qualifier)}${qualifier} football game` : "during a … football game";
  const can = label.trim().length > 0;

  return (
    <Sheet title="Add a level" onClose={onClose} size="sm"
      footer={<><span className="spacer" /><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!can} onClick={() => { addLevel(label, phrase, kind); onClose(); }}>Add and use it</Button></>}>
      <div className="card stack">
        <Field label="Name" hint="As it appears in the level list.">
          <TextInput value={label} autoFocus placeholder="Prep school" onChange={(e) => setLabel(e.target.value)} ariaLabel="Level name" />
        </Field>
        <Field label="In a caption" hint={<>What qualifies the game: <em>{example}</em>. Blank uses the name.</>}>
          <TextInput value={phrase} placeholder="prep school" onChange={(e) => setPhrase(e.target.value)} ariaLabel="Caption phrase" />
        </Field>
      </div>
      <RadioCards<LevelKind> name="level-kind" value={kind} onChange={setKind}
        options={LEVEL_KINDS.map((k) => ({ id: k.id, title: k.label, detail: k.detail }))} />
    </Sheet>
  );
}

export { React };
