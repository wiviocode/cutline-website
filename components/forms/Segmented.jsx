import React from 'react';

/** Compact segmented filter (Needs review / Approved / All). Active segment is gold. */
export function Segmented({ options, value, onChange, style }) {
  return (
    <div style={{ display: 'flex', background: 'var(--ink-3)', borderRadius: 'var(--radius-control)', padding: 2, gap: 2, ...style }}>
      {options.map((o) => (
        <button key={o} onClick={() => onChange && onChange(o)} style={{
          border: 0, fontFamily: 'var(--font-body)', fontSize: 12, padding: '3px 11px', borderRadius: 4, cursor: 'pointer',
          ...(o === value ? { background: 'var(--gold)', color: 'var(--on-gold)', fontWeight: 600 } : { background: 'none', color: 'var(--text-4)' }),
        }}>{o}</button>
      ))}
    </div>
  );
}
