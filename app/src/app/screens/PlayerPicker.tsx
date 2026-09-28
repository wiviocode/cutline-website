import { useEffect, useMemo, useState } from "react";
import { useStore, derive, type Frame } from "../store";
import { Button, Segmented, TextInput } from "../components";
import { Team, Player, Staff, type TeamKey } from "@core/roster/Roster";
import { likeness } from "@core/vision/FaceEvidence";

/**
 * Choosing who a subject is, in a panel over the caption column so the photograph stays in view.
 * One list per team — players by number, then the coaches — filtered by whatever is typed: a
 * number, a name, a position, or a title as the roster printed it ("head coach"). What the reading
 * and the face suggest comes first; for a coach, the staff does.
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
  const coachFirst = subject.kind !== "athlete";

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);

  const people = useMemo(() => {
    if (!team) return [];
    const q = query.trim().toLowerCase();
    const matches = (p: Player) => !q || p.number === q || (!!p.number && p.number.startsWith(q))
      || Player.fullName(p).toLowerCase().includes(q) || p.position.toLowerCase().includes(q) || p.positionAbbr.toLowerCase().includes(q);
    const players = Team.sortedPlayers(team).filter(matches);
    const staff = Staff.sorted(team.staff ?? []).filter(matches);
    // What the reading and the face suggest first.
    const suggested = new Set((identity?.alternatives ?? []).map((p) => p.id).concat(identity?.player ? [identity.player.id] : []).concat(faceHints.map((h) => h.playerID)));
    const faceRank = (id: string) => { const i = faceHints.findIndex((h) => h.playerID === id); return i < 0 ? 99 : i; };
    const first = players.filter((p) => suggested.has(p.id)).sort((a, b) => faceRank(a.id) - faceRank(b.id));
    const rest = players.filter((p) => !suggested.has(p.id));
    return coachFirst ? [...staff, ...first, ...rest] : [...first, ...rest, ...staff];
  }, [team, query, identity, faceHints, coachFirst]);

  const faces = !!team && [...team.players, ...(team.staff ?? [])].some((p) => p.headshotURL);
  const choose = (p: Player | null) => { void s.setManual(frame.id, subjectID, { teamKey, playerID: p?.id ?? null }); onClose(); };
  const read = subject.number ? `#${subject.number.replace(/\?/g, "_")} (${subject.clarity})` : "no number seen";
  const noun = subject.kind === "athlete" ? "player" : subject.kind === "other" ? "person" : subject.kind;

  return (
    <div className="picker" role="dialog" aria-label={`Who is this ${noun}?`}>
      <div className="picker-top">
        <b>Who is this {noun}?</b>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
      </div>
      {matchup ? (
        <Segmented value={teamKey} onChange={setTeamKey} options={[{ value: "A", label: matchup.a.school || "Team A" }, { value: "B", label: matchup.b.school || "Team B" }]} />
      ) : null}
      <TextInput autoFocus placeholder="Number, name or title (head coach)" value={query} onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && people[0]) choose(people[0]); }} />
      <p className="muted small">Read as {read}{subject.uniformText ? ` · “${subject.uniformText}”` : ""}{subject.role ? ` · ${subject.role}` : ""}</p>
      <div className="picker-list">
        {people.map((p, i) => {
          const staff = p.role === "staff";
          const current = identity?.player?.id === p.id;
          const suggested = identity?.alternatives.some((a) => a.id === p.id);
          const hint = faceHints.find((h) => h.playerID === p.id);
          const section = staff && (i === 0 || people[i - 1].role !== "staff") ? "Coaches" : !staff && i > 0 && people[i - 1].role === "staff" ? "Players" : null;
          return (
            <div key={p.id} className="pick-wrap">
              {section ? <div className="pick-section">{section}</div> : null}
              <button type="button" className={`pick${faces ? " pick-has-face" : ""}${current ? " pick-current" : ""}${suggested ? " pick-suggested" : ""}`} onClick={() => choose(p)}>
                {faces ? (p.headshotURL ? <img className="pick-face" src={p.headshotURL} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="pick-face" />) : null}
                <span className="pick-num">{staff ? "" : p.number || "–"}</span>
                <span className="pick-name">{Player.fullName(p) || "(no name)"}</span>
                <span className="pick-pos">{staff ? p.positionAbbr || p.position : p.positionAbbr || p.position}{hint ? <span className="pick-face-hint"> · {likeness(hint.score)}</span> : null}</span>
              </button>
            </div>
          );
        })}
        {!people.length ? <p className="muted small">No one on this roster matches.{!(team?.staff ?? []).length && /coach/i.test(query) ? " This roster has no coaches — add them under Edit roster on the setup screen." : ""}</p> : null}
      </div>
      <div className="picker-foot">
        <Button small onClick={() => choose(null)}>Leave unnamed</Button>
        {frame.manual[subjectID] ? <Button small kind="ghost" onClick={() => { void s.setManual(frame.id, subjectID, null); onClose(); }}>Back to the reading</Button> : null}
      </div>
    </div>
  );
}
