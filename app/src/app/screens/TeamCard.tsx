import { useRef, useState } from "react";
import { useStore } from "../store";
import { Button, Field, Headshot, Segmented, TextInput, Spinner, Select } from "../components";
import { Team, Player, Staff, type TeamKey } from "@core/roster/Roster";
import { Levels, Sports } from "@core/sports/Sports";
import { colourName } from "@core/vision/Prompt";

/**
 * One side of the game: who they are, where the roster came from, who is on it — headshots,
 * the head coach, the first few names — and what they are wearing today.
 */
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
  const players = team ? Team.sortedPlayers(team) : [];
  const withFaces = players.filter((p) => p.headshotURL);
  const staff = team ? Staff.sorted(team.staff ?? []) : [];
  const head = staff.find((c) => /^head coach$/i.test(c.position)) ?? staff[0];
  const colour = team?.colors[0] ? cssColour(team.colors[0]) : null;

  return (
    <section className={`card team-card${hasRoster ? " team-ready" : ""}`} aria-label={label}>
      <div className="card-head">
        <span className="faint">{label}</span>
        {team ? <button type="button" className="link" onClick={() => s.clearTeam(slot)}>Clear</button> : null}
      </div>

      <div className="team-name">
        <span className="team-swatch" style={colour ? { background: colour } : undefined} title={team?.colors.map((c) => (/^[0-9a-f]{6}$/i.test(c) ? colourName(c) : c)).join(", ") || "School colours not known"} />
        <div className="team-name-inputs">
          <input className="input input-bare input-school" aria-label={`${label} school`} placeholder={slot === "A" ? "School (Nebraska)" : "School (Bowling Green)"} value={team?.school ?? ""} onChange={(e) => s.editTeam(slot, { school: e.target.value })} spellCheck={false} />
          <input className="input input-bare input-nick" aria-label={`${label} nickname`} placeholder={team?.school ? "Nickname" : slot === "A" ? "Nickname (Cornhuskers)" : "Nickname (Falcons)"} value={team?.nickname ?? ""} onChange={(e) => s.editTeam(slot, { nickname: e.target.value || null })} spellCheck={false} />
        </div>
      </div>

      {!hasRoster ? (
        <div className="import">
          <div className="import-tabs">
            <Segmented small value={mode} onChange={setMode} options={[{ value: "link", label: "Link" }, { value: "paste", label: "Paste" }]} />
            <button type="button" className="link" onClick={() => file.current?.click()}>Open a file…</button>
            <input ref={file} type="file" hidden accept=".csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg,.webp,.html,.htm" onChange={(e) => { const f = e.target.files?.[0]; if (f) void s.importFile(slot, f); e.target.value = ""; }} />
          </div>
          {mode === "link" ? (
            <form className="row" onSubmit={(e) => { e.preventDefault(); void s.importLink(slot); }}>
              <TextInput aria-label={`${label} roster link`} placeholder={kind === "college" ? "huskers.com or the roster page" : "maxpreps.com team page"} value={st.link} onChange={(e) => s.setLink(slot, e.target.value)} disabled={st.busy} />
              <Button kind="primary" type="submit" disabled={st.busy || !st.link.trim() || s.relay === false}>{st.busy ? <Spinner /> : "Read"}</Button>
            </form>
          ) : (
            <div className="paste">
              <textarea className="input textarea" rows={5} placeholder="Paste the roster: copied from the page, a spreadsheet, or the page's HTML" value={paste} onChange={(e) => setPaste(e.target.value)} />
              <Button kind="primary" disabled={st.busy || !paste.trim()} onClick={() => s.importText(slot, paste)}>{st.busy ? <Spinner /> : "Read pasted roster"}</Button>
            </div>
          )}
          {s.relay === false && mode === "link" ? <p className="warn small">Links can't be read on this server — paste the roster instead.</p> : null}
          {saved.length ? (
            <Select value="" ariaLabel="Your teams" onChange={(id) => { const t = saved.find((x) => x.team.id === id); if (t) s.useSaved(slot, t); }}
              options={[{ value: "", label: `Your saved teams (${saved.length})` }, ...saved.map((t) => ({ value: t.team.id, label: `${Team.fullName(t.team)} · ${t.team.players.length} players` }))]} />
          ) : null}
          <p className="faint small">{kind === "college" ? "Sidearm and WMT sites (most of college sports) are read exactly, with headshots and coaches, at no cost." : "MaxPreps rosters and coaches are read exactly, at no cost."} Other pages, screenshots and PDFs are read by Claude for about a cent.</p>
        </div>
      ) : (
        <>
          <div className="team-src">
            <span className="input input-static" title={team!.sourceURL ?? undefined}>{host(team!.sourceURL) ?? "Pasted or from a file"}</span>
            <span className="okt" title={st.status ?? undefined}>✓ Read</span>
          </div>
          <div className="team-sum">
            {withFaces.length ? (
              <span className="stack">
                {withFaces.slice(0, 6).map((p) => <Headshot key={p.id} url={p.headshotURL} size="round" />)}
                {players.length > 6 ? <span className="stack-more">+{players.length - Math.min(6, withFaces.length)}</span> : null}
              </span>
            ) : null}
            <span className="counts"><b>{players.length}</b> players{staff.length ? <> · <b>{staff.length}</b> staff</> : null}{withFaces.length ? " · headshots" : ""}</span>
          </div>
          {head ? (
            <div className="team-coach">
              <Headshot url={head.headshotURL} size="sm" fallback="HC" />
              <div><small>{cap(head.position || "Coach")}</small><b>{Player.fullName(head)}</b></div>
            </div>
          ) : null}
          {showRoster ? <RosterTable slot={slot} /> : (
            <div className="mini">
              {players.slice(0, 10).map((p) => <span key={p.id}><span className="mono">{p.number || "–"}</span>{Player.fullName(p)}</span>)}
              {players.length > 10 ? <span className="more-n">and {players.length - 10} more{staff.length > 1 ? ` · ${staff.length - 1} more on the staff` : ""}</span> : null}
            </div>
          )}
        </>
      )}

      {st.status && !hasRoster ? <p className="ok small">{st.status}</p> : null}
      {st.notes.map((n) => <p key={n} className="warn small">{n}</p>)}
      {st.error ? <p className="error small">{st.error}</p> : null}

      {team ? (
        <Field label="Wearing today" hint={team.uniform ? undefined : "Read from a few of your photos when the run starts — or describe it"}>

          <textarea className="input textarea uniform" rows={2} placeholder="red jerseys, white numbers" value={team.uniform} onChange={(e) => s.editTeam(slot, { uniform: e.target.value })} />
        </Field>
      ) : null}

      {hasRoster ? (
        <div className="team-links">
          <button type="button" className="link" onClick={() => setShowRoster((v) => !v)}>{showRoster ? "Done editing" : "Edit roster"}</button>
          <button type="button" className="link" onClick={() => s.saveTeamToLibrary(slot)}>Save to your teams</button>
        </div>
      ) : null}
    </section>
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
      <table className="staff-table">
        <thead><tr><th>Coaches</th><th /><th>Title</th><th /></tr></thead>
        <tbody>
          {(team.staff ?? []).map((p) => (
            <tr key={p.id}>
              <td><input className="cell" value={p.firstName} aria-label="Coach first name" onChange={(e) => s.editPlayer(slot, p.id, { firstName: e.target.value })} /></td>
              <td><input className="cell" value={p.lastName} aria-label="Coach last name" onChange={(e) => s.editPlayer(slot, p.id, { lastName: e.target.value })} /></td>
              <td><input className="cell" value={p.positionAbbr} aria-label="Coach title" placeholder="Head Coach" onChange={(e) => s.editPlayer(slot, p.id, { positionAbbr: e.target.value, position: Staff.captionTitle(e.target.value) })} /></td>
              <td><button type="button" className="icon-btn" aria-label={`Remove ${Player.fullName(p)}`} onClick={() => s.removePlayer(slot, p.id)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button small onClick={() => s.addStaff(slot)}>Add coach</Button>
    </div>
  );
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "huskers.com" from the roster page's address. */
function host(url: string | null | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

/** School colours arrive as hex from MaxPreps and as words from everywhere else. */
const SCHOOL_COLOURS: Record<string, string> = {
  "carolina blue": "#7BAFD4", "columbia blue": "#9BDDFF", "powder blue": "#B0E0E6", "royal blue": "#4169E1", "navy blue": "#1F2A44", navy: "#1F2A44",
  scarlet: "#BB0000", crimson: "#9E1B32", cardinal: "#8C1515", "cardinal red": "#C41E3A", maroon: "#6E1A2A", garnet: "#73000A",
  cream: "#F5F1E3", "old gold": "#CFB53B", "vegas gold": "#C5B358", gold: "#FFC72C", "burnt orange": "#BF5700", orange: "#FF7300",
  "kelly green": "#4CBB17", "forest green": "#154734", "hunter green": "#355E3B", green: "#007A33", purple: "#4E2A84", silver: "#A2AAAD", brown: "#4F2C1D",
  // Plain colour words, as a school wears them rather than as a screen shows them.
  red: "#C8102E", blue: "#1F4FA8", "light blue": "#7BAFD4", "sky blue": "#7BAFD4", "dark blue": "#13294B", yellow: "#FFC72C", black: "#1B1B1D", white: "#E9ECF0", grey: "#8D97A5", gray: "#8D97A5", pink: "#E86FA0", teal: "#00747A",
};
function cssColour(c: string): string {
  if (/^[0-9a-f]{6}$/i.test(c)) return `#${c}`;
  const k = c.trim().toLowerCase();
  if (SCHOOL_COLOURS[k]) return SCHOOL_COLOURS[k];
  return typeof CSS !== "undefined" && CSS.supports("color", k) ? k : "transparent";
}
