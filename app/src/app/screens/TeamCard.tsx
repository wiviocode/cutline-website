import { useRef, useState } from "react";
import { useStore } from "../store";
import { Button, TextInput, Spinner, Select } from "../components";
import { Team, Player, type TeamKey } from "@core/roster/Roster";
import { Levels, Sports } from "@core/sports/Sports";
import { colourName } from "@core/vision/Prompt";

export function TeamCard({ slot }: { slot: TeamKey }) {
  const s = useStore();
  const st = s.slots[slot];
  const team = st.team;
  const [mode, setMode] = useState<"link" | "paste">("link");
  const [paste, setPaste] = useState("");
  const [showRoster, setShowRoster] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const kind = Levels.info(s.setup.levelId).kind;
  const saved = s.library.filter((t) => t.sport === s.setup.sport && t.gender === s.setup.gender && t.level === kind);
  const hasRoster = !!team?.players.length;
  const label = slot === "A" ? "Your team" : "Opponent";

  return (
    <div className={`team-card${hasRoster ? " team-ready" : ""}`}>
      <div className="team-head">
        <span className="overline">{label}</span>
        {team ? <button type="button" className="link small" onClick={() => s.clearTeam(slot)}>Clear</button> : null}
      </div>

      <div className="team-names">
        <TextInput aria-label={`${label} school`} placeholder={slot === "A" ? "School (Nebraska)" : "School (Bowling Green)"} value={team?.school ?? ""} onChange={(e) => s.editTeam(slot, { school: e.target.value })} />
        <TextInput aria-label={`${label} nickname`} placeholder={slot === "A" ? "Nickname (Cornhuskers)" : "Nickname (Falcons)"} value={team?.nickname ?? ""} onChange={(e) => s.editTeam(slot, { nickname: e.target.value || null })} />
      </div>

      {!hasRoster ? (
        <div className="import">
          <div className="import-tabs">
            <button type="button" className={`chip${mode === "link" ? " chip-on" : ""}`} onClick={() => setMode("link")}>Link</button>
            <button type="button" className={`chip${mode === "paste" ? " chip-on" : ""}`} onClick={() => setMode("paste")}>Paste</button>
            <button type="button" className="chip" onClick={() => file.current?.click()}>File</button>
            <input ref={file} type="file" hidden accept=".csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg,.webp,.html,.htm" onChange={(e) => { const f = e.target.files?.[0]; if (f) void s.importFile(slot, f); e.target.value = ""; }} />
          </div>
          {mode === "link" ? (
            <form className="row" onSubmit={(e) => { e.preventDefault(); void s.importLink(slot); }}>
              <TextInput aria-label={`${label} roster link`} placeholder={kind === "college" ? "huskers.com or the roster page" : "maxpreps.com team page"} value={st.link} onChange={(e) => s.setLink(slot, e.target.value)} disabled={st.busy} />
              <Button kind="primary" type="submit" disabled={st.busy || !st.link.trim() || s.relay === false}>{st.busy ? <Spinner /> : "Read"}</Button>
            </form>
          ) : (
            <div className="paste">
              <textarea className="input textarea" rows={4} placeholder="Paste the roster: copied from the page, a spreadsheet, or the page's HTML" value={paste} onChange={(e) => setPaste(e.target.value)} />
              <Button kind="primary" small disabled={st.busy || !paste.trim()} onClick={() => s.importText(slot, paste)}>{st.busy ? <Spinner /> : "Read pasted roster"}</Button>
            </div>
          )}
          {s.relay === false && mode === "link" ? <p className="warn small">Links can't be read on this server — paste the roster instead.</p> : null}
          {saved.length ? (
            <div className="saved">
              <Select value="" ariaLabel="Your teams" onChange={(id) => { const t = saved.find((x) => x.team.id === id); if (t) s.useSaved(slot, t); }}
                options={[{ value: "", label: `Your teams (${saved.length})` }, ...saved.map((t) => ({ value: t.team.id, label: `${Team.fullName(t.team)} · ${t.team.players.length}` }))]} />
            </div>
          ) : null}
          <p className="muted small">{kind === "college" ? "Most college sites (Sidearm, WMT) are read exactly, with headshots, at no cost." : "MaxPreps rosters are read exactly, at no cost."} Other pages, screenshots and PDFs are read by Claude for about a cent.</p>
        </div>
      ) : (
        <div className="team-summary">
          <div className="swatches">
            {team!.colors.slice(0, 3).map((c) => <span key={c} className="swatch" style={{ background: cssColour(c) }} title={/^[0-9a-f]{6}$/i.test(c) ? colourName(c) : c} />)}
          </div>
          <span className="meta">{team!.players.length} players{team!.players.some((p) => p.headshotURL) ? " · headshots" : ""}</span>
          <button type="button" className="link small" onClick={() => setShowRoster((v) => !v)}>{showRoster ? "Hide roster" : "Edit roster"}</button>
          <button type="button" className="link small" onClick={() => s.saveTeamToLibrary(slot)}>Save to your teams</button>
        </div>
      )}

      {st.status ? <p className="ok small">{st.status}</p> : null}
      {st.notes.map((n) => <p key={n} className="warn small">{n}</p>)}
      {st.error ? <p className="error small">{st.error}</p> : null}

      {team ? (
        <label className="uniform">
          <span className="field-label">Wearing today</span>
          <textarea className="input textarea" rows={2} placeholder="Read from your photos when the run starts — or describe it: red jerseys, white numbers" value={team.uniform} onChange={(e) => s.editTeam(slot, { uniform: e.target.value })} />
        </label>
      ) : null}

      {hasRoster && showRoster ? <RosterTable slot={slot} /> : null}
    </div>
  );
}

function RosterTable({ slot }: { slot: TeamKey }) {
  const s = useStore();
  const team = s.slots[slot].team!;
  const unit = Sports.hasUnits(s.setup.sport);
  return (
    <div className="roster">
      <table>
        <thead><tr><th>No.</th><th>First</th><th>Last</th><th>Position</th>{unit ? <th>Unit</th> : null}<th /></tr></thead>
        <tbody>
          {Team.sortedPlayers(team).map((p) => (
            <tr key={p.id}>
              <td><input className="cell num" value={p.number} aria-label="Number" onChange={(e) => s.editPlayer(slot, p.id, { number: e.target.value.replace(/[^0-9]/g, "") })} /></td>
              <td><input className="cell" value={p.firstName} aria-label="First name" onChange={(e) => s.editPlayer(slot, p.id, { firstName: e.target.value })} /></td>
              <td><input className="cell" value={p.lastName} aria-label="Last name" onChange={(e) => s.editPlayer(slot, p.id, { lastName: e.target.value })} /></td>
              <td><input className="cell" value={p.position} aria-label="Position" onChange={(e) => s.editPlayer(slot, p.id, { position: e.target.value })} /></td>
              {unit ? <td className="meta">{p.side === "unknown" ? "" : p.side === "specialTeams" ? "ST" : p.side.slice(0, 3)}{p.secondary ? `/${p.secondary.side.slice(0, 3)}` : ""}</td> : null}
              <td><button type="button" className="icon-btn" aria-label={`Remove ${Player.fullName(p)}`} onClick={() => s.removePlayer(slot, p.id)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button small onClick={() => s.addPlayer(slot)}>Add player</Button>
    </div>
  );
}

/** School colours arrive as hex from MaxPreps and as words from everywhere else. */
const SCHOOL_COLOURS: Record<string, string> = {
  "carolina blue": "#7BAFD4", "columbia blue": "#9BDDFF", "powder blue": "#B0E0E6", "royal blue": "#4169E1", "navy blue": "#1F2A44", navy: "#1F2A44",
  scarlet: "#BB0000", crimson: "#9E1B32", cardinal: "#8C1515", "cardinal red": "#C41E3A", maroon: "#6E1A2A", garnet: "#73000A",
  cream: "#F5F1E3", "old gold": "#CFB53B", "vegas gold": "#C5B358", gold: "#FFC72C", "burnt orange": "#BF5700", orange: "#FF7300",
  "kelly green": "#4CBB17", "forest green": "#154734", "hunter green": "#355E3B", green: "#007A33", purple: "#4E2A84", silver: "#A2AAAD", brown: "#4F2C1D",
};
function cssColour(c: string): string {
  if (/^[0-9a-f]{6}$/i.test(c)) return `#${c}`;
  const k = c.trim().toLowerCase();
  if (SCHOOL_COLOURS[k]) return SCHOOL_COLOURS[k];
  return typeof CSS !== "undefined" && CSS.supports("color", k) ? k : "transparent";
}
