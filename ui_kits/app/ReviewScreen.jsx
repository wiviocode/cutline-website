import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { KitChip } from '../../components/core/KitChip.jsx';
import { Overline } from '../../components/core/Overline.jsx';
import { Segmented } from '../../components/forms/Segmented.jsx';
import { TextInput } from '../../components/forms/TextInput.jsx';
import { TextArea } from '../../components/forms/TextArea.jsx';

const roster = { '2': 'Adrian Martinez', '7': 'Malik Reed', '15': 'Case Nelson', '22': 'D. Walker', '88': 'T. Osei' };
const pos = { '2': 'quarterback', '7': 'wide receiver', '15': 'tight end', '22': 'running back', '88': 'wide receiver' };
const grads = ['linear-gradient(160deg, #5c6878, #333a44)', 'linear-gradient(160deg, #6b5f52, #3a3630)', 'linear-gradient(160deg, #4e6070, #2e3843)'];
const compose = (num, action) => 'Nebraska Cornhuskers ' + pos[num] + ' ' + roster[num] + ' (' + num + ') ' + action +
  ' during an NCAA college football game against the Ohio State Buckeyes, Saturday, Sept. 14, 2024, in Lincoln, Neb. (AP Photo/John Doe)';
const defs = [
  ['2', 'throws a pass in the first quarter', 0, true],
  ['22', 'takes the handoff up the middle', 0, false],
  ['2', 'throws a pass in the third quarter', 1, false],
  ['7', 'hauls in a deep pass along the sideline', 0, false],
  ['88', 'celebrates after a touchdown', 0, false],
];

/** The Review screen: filmstrip, 1:1 zoom, caption edit, jersey correction, approve-and-next. */
export function ReviewScreen({ height = 640 }) {
  const [frames, setFrames] = React.useState(defs.map((d, i) => ({
    num: String(41 + i).padStart(4, '0'), caption: compose(d[0], d[1]),
    jerseys: [{ number: d[0], colour: '#b3202c' }].concat(d[2] ? [{ number: '?', colour: '#9aa1ab' }] : []),
    approved: d[3], edited: false, grad: grads[i % 3],
  })));
  const [cur, setCur] = React.useState(2);
  const [filter, setFilter] = React.useState('all');
  const [zoom, setZoom] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editText, setEditText] = React.useState('');
  const [pop, setPop] = React.useState(null); // {slot, val}
  const f = frames[cur];
  const needs = frames.filter(x => x.jerseys.some(j => j.number === '?')).length;
  const approvedN = frames.filter(x => x.approved).length;
  const filterLabels = { all: 'All ' + frames.length, needs: 'Needs review ' + needs, approved: 'Approved ' + approvedN };
  const visible = frames.map((_, i) => i).filter(i =>
    filter === 'needs' ? frames[i].jerseys.some(j => j.number === '?') : filter === 'approved' ? frames[i].approved : true);
  const go = (i) => { setCur(Math.max(0, Math.min(frames.length - 1, i))); setZoom(false); setEditing(false); setPop(null); };
  const approve = () => { if (!f.approved) { setFrames(fs => fs.map((x, i) => i === cur ? { ...x, approved: true } : x)); go(cur + 1); } };
  const saveEdit = () => { const t = editText.replace(/\s*\n+\s*/g, ' ').trim(); if (t) setFrames(fs => fs.map((x, i) => i === cur ? { ...x, caption: t, edited: true } : x)); setEditing(false); };
  const applyPop = () => { const v = (pop.val || '').trim(); if (v) setFrames(fs => fs.map((x, i) => i === cur ? { ...x, jerseys: x.jerseys.map((j, s) => s === pop.slot ? { ...j, number: v } : j) } : x)); setPop(null); };
  const onKey = (e) => {
    if (editing || pop) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); }
    if (e.key === 'Enter') { e.preventDefault(); approve(); }
    if (e.key === 'e') { e.preventDefault(); setEditText(f.caption); setEditing(true); }
    if (e.key === 'n') { e.preventDefault(); let s = f.jerseys.findIndex(j => j.number === '?'); if (s < 0) s = 0; setPop({ slot: s, val: f.jerseys[s].number === '?' ? '' : f.jerseys[s].number }); }
    if (e.key === ' ') { e.preventDefault(); setZoom(z => !z); }
  };
  const name = roster[f.jerseys[0].number] || '';
  const idx = name ? f.caption.indexOf(name) : -1;
  return (
    <div tabIndex={0} onKeyDown={onKey} style={{ height, display: 'flex', flexDirection: 'column', background: 'var(--ink-1)',
      color: 'var(--text-1)', font: '12.5px/1.5 var(--font-body)', userSelect: 'none', overflow: 'hidden', outline: 'none' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 14px', background: 'var(--ink-2)', borderBottom: '1px solid var(--border-control)', flex: 'none' }}>
        <Button variant="secondary">‹ Game</Button>
        <span style={{ width: 22, height: 22, borderRadius: 5, display: 'grid', placeItems: 'center', font: '700 8.5px/1 var(--font-mono)', background: '#b3202c', color: '#fff', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.14)' }}>N</span>
        <b style={{ fontSize: 13 }}>Nebraska</b><span style={{ color: 'var(--text-4)' }}>vs</span>
        <span style={{ width: 22, height: 22, borderRadius: 5, display: 'grid', placeItems: 'center', font: '700 8.5px/1 var(--font-mono)', background: '#9aa1ab', color: '#000', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.14)' }}>OS</span>
        <b style={{ fontSize: 13 }}>Ohio State</b>
        <span style={{ color: 'var(--text-4)' }}>Football · College · Memorial Stadium</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-4)' }}>AP style</span>
      </header>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 14px', borderBottom: '1px solid var(--border-control)', flex: 'none', fontSize: 12 }}>
        <Segmented options={[filterLabels.needs, filterLabels.approved, filterLabels.all]} value={filterLabels[filter]}
          onChange={(v) => setFilter(Object.keys(filterLabels).find(k => filterLabels[k] === v) || 'all')} />
        <span style={{ color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>{cur + 1} of {frames.length}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>JD20240914_FB_NEB_v_OSU_{f.num}.jpg</span>
      </div>
      <main style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div onClick={() => setZoom(z => !z)} style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, cursor: zoom ? 'zoom-out' : 'zoom-in' }}>
          <div style={{ aspectRatio: '3 / 2', maxWidth: '100%', maxHeight: '100%', width: '100%', borderRadius: 2, background: f.grad,
            boxShadow: '0 0 0 1px rgba(255,255,255,0.06), 0 12px 40px rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center',
            transform: zoom ? 'scale(2.1)' : 'none', transition: 'transform 0.18s var(--ease-brand)' }}>
            <span style={{ font: '11px/1.4 var(--font-mono)', color: '#6b7480', letterSpacing: '0.06em' }}>action photo — {f.num}{zoom ? ' · 1:1' : ''}</span>
          </div>
        </div>
        <aside style={{ width: 300, flex: 'none', background: '#20242a', borderLeft: '1px solid var(--border-control)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '13px 13px 18px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1 }}>
            <div>
              <Overline style={{ marginBottom: 6 }}>Caption</Overline>
              {!editing ? (
                <div onClick={() => { setEditText(f.caption); setEditing(true); }} title="Click to edit — or press e"
                  style={{ background: 'var(--ink-3)', border: '1px solid var(--border-control)', borderRadius: 7, padding: 10, lineHeight: 1.5, userSelect: 'text', cursor: 'text' }}>
                  {idx >= 0 ? (<span>{f.caption.slice(0, idx)}<span style={{ fontWeight: 600, borderBottom: '1.5px dotted var(--gold)' }}>{name}</span>{f.caption.slice(idx + name.length)}</span>) : f.caption}
                </div>
              ) : (
                <div>
                  <TextArea value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditing(false); }} />
                  <div style={{ display: 'flex', gap: 10, fontSize: 10.5, color: 'var(--text-4)', marginTop: 6 }}><span>⏎ save</span><span>esc cancel</span></div>
                </div>
              )}
            </div>
            <div>
              <Overline style={{ marginBottom: 6 }}>Numbers read</Overline>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {f.jerseys.map((j, s) => (
                  <KitChip key={s} number={j.number} name={roster[j.number]} colour={j.colour} flagged={j.number === '?'}
                    onClick={() => setPop({ slot: s, val: j.number === '?' ? '' : j.number })} />
                ))}
              </div>
              {pop && (
                <div style={{ marginTop: 9, background: 'var(--ink-2)', border: '1px solid var(--border-control)', borderRadius: 9, boxShadow: 'var(--shadow-popover)', padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <b style={{ fontSize: 12.5 }}>Jersey number</b>
                  <TextInput mono autoFocus value={pop.val} onChange={(e) => setPop({ ...pop, val: e.target.value })}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') applyPop(); if (e.key === 'Escape') setPop(null); }} />
                  <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: 0, lineHeight: 1.4 }}>The caption is rebuilt from the roster — no new request to the model.</p>
                  <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
                    <Button variant="ghost" onClick={() => setPop(null)}>Cancel</Button>
                    <Button onClick={applyPop}>Set</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div style={{ padding: 12, borderTop: '1px solid var(--border-control)', display: 'flex', flexDirection: 'column', gap: 7, flex: 'none' }}>
            {f.approved
              ? <Button variant="ghost" style={{ width: '100%', height: 34, fontSize: 13 }}>✓  Approved</Button>
              : <Button onClick={approve} style={{ width: '100%', height: 34, fontSize: 13 }}>Approve and next  ⏎</Button>}
            <div style={{ fontSize: 10.5, color: 'var(--text-4)', textAlign: 'center' }}>{f.edited ? 'Edited · written to the file' : 'Written to the file · IPTC + XMP'}</div>
          </div>
        </aside>
      </main>
      <div style={{ flex: 'none', display: 'flex', gap: 5, padding: 7, background: 'var(--ink-2)', borderTop: '1px solid var(--border-control)', overflow: 'hidden' }}>
        {visible.map((i) => (
          <i key={i} onClick={() => go(i)} style={{ width: 104, height: 70, borderRadius: 4, flex: 'none', cursor: 'pointer', background: frames[i].grad,
            outline: i === cur ? '3px solid var(--gold)' : 'none', outlineOffset: -3, opacity: frames[i].approved && i !== cur ? 0.55 : 1 }}></i>
        ))}
      </div>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', background: 'var(--ink-2)', borderTop: '1px solid var(--border-control)', flex: 'none', height: 46, fontSize: 12 }}>
        <span style={{ color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Captioned {frames.length} of {frames.length} · {approvedN} approved · try the arrow keys</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>$1.84</span>
        <Button>Caption photos</Button><Button variant="secondary">Redo all</Button><Button variant="secondary">Rename photos…</Button>
      </nav>
    </div>
  );
}
