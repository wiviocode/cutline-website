import { useEffect, useState } from "react";
import { useStore } from "../store";
import { Button, Modal, Segmented, Spinner } from "../components";
import type { RenamePlan } from "@core/naming/PhotoRenamer";

/**
 * Renaming the shoot to the desk's convention — EL20260912_FB_NU_v_BGS_0001.jpg — in capture
 * order, with every record and sidecar moving with its photograph.
 */
export function RenameDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [home, setHome] = useState(true);
  const [plan, setPlan] = useState<RenamePlan | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; void s.renamePlan(home).then((p) => { if (live) setPlan(p); }); return () => { live = false; }; }, [home, s]);
  const moving = plan?.items.filter((i) => i.source !== i.destination) ?? [];
  const sample = plan ? [...plan.items.slice(0, 3), ...(plan.items.length > 4 ? [plan.items[plan.items.length - 1]] : [])] : [];

  return (
    <Modal title="Rename the photographs" onClose={onClose}>
      <p className="muted small">Numbered in the order they were taken. Each photograph's caption record and sidecar move with it.</p>
      <Segmented value={home ? "home" : "away"} onChange={(v) => setHome(v === "home")} options={[
        { value: "home", label: `${s.slots.A.team?.school ?? "Your team"} at home` },
        { value: "away", label: `${s.slots.A.team?.school ?? "Your team"} away` },
      ]} />
      {!plan ? <Spinner /> : (
        <>
          <div className="rename-list">
            {sample.map((i, n) => (
              <div key={i.source} className="rename-row">
                {n === 3 ? <span className="muted">…</span> : null}
                <span className="meta">{i.source}</span><span className="muted">→</span><span className="meta rename-to">{i.destination}</span>
              </div>
            ))}
          </div>
          {plan.problems.map((p) => <p key={p} className="error small">{p}</p>)}
        </>
      )}
      <div className="row">
        <Button kind="primary" disabled={!plan || !!plan.problems.length || !moving.length || busy} onClick={async () => { setBusy(true); await s.applyRename(plan!); setBusy(false); onClose(); }}>
          {busy ? <Spinner /> : `Rename ${moving.length} photograph${moving.length === 1 ? "" : "s"}`}
        </Button>
        <Button kind="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}
