import { useMemo, useState } from "react";
import { useStore, derive, type Frame } from "../store";
import { Button, Modal, Segmented, TextInput } from "../components";
import { Team, Player, type TeamKey } from "@core/roster/Roster";

/**
 * Choosing who a subject is: the team's roster as a grid of numbers — with headshots where the
 * roster had them — filtered as a number or a name is typed. The number the model read, and the
 * players it could be, come first.
 */
export function PlayerPicker({ frame, subjectID, onClose }: { frame: Frame; subjectID: string; onClose: () => void }) {
  const s = useStore();
  const subject = frame.observation!.subjects.find((x) => x.id === subjectID)!;
  const identity = frame.identities.find((i) => i.subjectId === subjectID);
  const matchup = derive.matchup(s);
  const startTeam: TeamKey = identity?.teamKey ?? (subject.team === "B" ? "B" : "A");
  const [teamKey, setTeamKey] = useState<TeamKey>(startTeam);
  const [query, setQuery] = useState("");
  const faceHints = frame.faceHints[subjectID] ?? [];
  const team = matchup ? (teamKey === "A" ? matchup.a : matchup.b) : null;

  const players = useMemo(() => {
    if (!team) return [];
    const q = query.trim().toLowerCase();
    const list = Team.sortedPlayers(team).filter((p) => !q || p.number === q || p.number.startsWith(q) || Player.fullName(p).toLowerCase().includes(q));
    // What the reading and the face suggest first.
    const suggested = new Set((identity?.alternatives ?? []).map((p) => p.id).concat(identity?.player ? [identity.player.id] : []).concat(faceHints.map((h) => h.playerID)));
    const faceRank = (id: string) => { const i = faceHints.findIndex((h) => h.playerID === id); return i < 0 ? 99 : i; };
    const first = list.filter((p) => suggested.has(p.id)).sort((a, b) => faceRank(a.id) - faceRank(b.id));
    return [...first, ...list.filter((p) => !suggested.has(p.id))];
  }, [team, query, identity, faceHints]);

  const faces = !!team?.players.some((p) => p.headshotURL);
  const choose = (p: Player | null) => { void s.setManual(frame.id, subjectID, { teamKey, playerID: p?.id ?? null }); onClose(); };
  const read = subject.number ? `#${subject.number.replace(/\?/g, "_")} (${subject.clarity})` : "no number visible";

  return (
    <Modal title={`Who is ${subject.id.replace("P", "player ")}?`} onClose={onClose} wide>
      <div className="picker-head">
        {matchup ? (
          <Segmented value={teamKey} onChange={setTeamKey} options={[{ value: "A", label: Team.fullName(matchup.a) || "Team A" }, { value: "B", label: Team.fullName(matchup.b) || "Team B" }]} />
        ) : null}
        <TextInput autoFocus placeholder="Type a number or a name" value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && players[0]) choose(players[0]); }} />
      </div>
      <p className="muted small">Read as {read}{subject.uniformText ? ` · lettering “${subject.uniformText}”` : ""}{subject.role ? ` · ${subject.role}` : ""}. {identity?.reason}</p>
      <div className="picker-grid">
        {players.map((p) => {
          const current = identity?.player?.id === p.id;
          const suggested = identity?.alternatives.some((a) => a.id === p.id);
          return (
            <button key={p.id} type="button" className={`pick${faces ? "" : " pick-nofaces"}${current ? " pick-current" : ""}${suggested ? " pick-suggested" : ""}`} onClick={() => choose(p)}>
              {faces ? (p.headshotURL ? <img className="pick-face" src={p.headshotURL} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="pick-face pick-noface" />) : null}
              <span className="pick-num">{p.number || "–"}</span>
              <span className="pick-name">{Player.fullName(p)}</span>
              <span className="pick-pos">{p.positionAbbr || p.position}{faceHints.find((h) => h.playerID === p.id) ? ` · looks like (${faceHints.find((h) => h.playerID === p.id)!.distance.toFixed(2)})` : ""}</span>
            </button>
          );
        })}
        {!players.length ? <p className="muted">No one on this roster matches.</p> : null}
      </div>
      <div className="picker-foot">
        <Button onClick={() => choose(null)}>Leave unnamed</Button>
        {frame.manual[subjectID] ? <Button kind="ghost" onClick={() => { void s.setManual(frame.id, subjectID, null); onClose(); }}>Back to the reading</Button> : null}
      </div>
    </Modal>
  );
}
