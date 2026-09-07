/**
 * Where the model runs, and what that takes: a key for Anthropic or OpenAI, or a server on this
 * Mac. The same control on the welcome screen and in Settings; each provider says plainly where
 * the photographs go before the key is asked for.
 */

import React, { useState } from "react";
import { useStore } from "../store";
import { Segmented } from "../components";
import { KeyField } from "./KeyField";
import { LocalModelSetup } from "./LocalModelSetup";
import { Providers, type ProviderID, type KeyedProviderID } from "@core/models/Providers";
import { VisionModel } from "@core/models/VisionModel";
import { Access } from "@core/models/VisionClient";

export function ProviderSetup({ autoFocus = false }: { autoFocus?: boolean }) {
  const modelProvider = useStore((s) => VisionModel.byID(s.settings.model).provider);
  const keys = useStore((s) => s.keys);
  const localModel = useStore((s) => s.settings.localModel);
  const localBaseURL = useStore((s) => s.settings.localBaseURL);
  const [tab, setTab] = useState<ProviderID>(modelProvider);
  const access = { keys, localBaseURL, localModel };
  const info = Providers.info(tab);

  return (
    <div className="stack">
      <Segmented<ProviderID> ariaLabel="Where the model runs" value={tab} onChange={setTab}
        options={Providers.all.map((p) => ({ id: p.id, label: Access.providerReady(p.id, access) ? `${p.name} ✓` : p.name }))} />
      <p className="note">
        {info.needsKey ? `Photographs go from this browser straight to ${info.destination}, with no server of ours in between. ` : ""}{info.dataUse}
      </p>
      {info.needsKey ? <KeyField provider={tab as KeyedProviderID} autoFocus={autoFocus} /> : <LocalModelSetup />}
    </div>
  );
}

export { React };
