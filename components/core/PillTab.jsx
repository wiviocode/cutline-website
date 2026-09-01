import React from 'react';

/** Pill-shaped tab; the active one is solid gold. Used for house-style pickers. */
export function PillTab({ active = false, children, onClick, style }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      borderRadius: 'var(--radius-pill)', padding: '6px 15px', fontFamily: 'var(--font-mono)', fontSize: 12,
      cursor: 'pointer', lineHeight: 1.3, transition: 'color 0.18s var(--ease-brand)',
      ...(active
        ? { border: '1px solid var(--gold)', background: 'var(--gold)', color: 'var(--on-gold)', fontWeight: 600 }
        : { border: '1px solid var(--border-control)', background: 'transparent', color: hover ? 'var(--text-1)' : 'var(--text-4)' }),
      ...style,
    }}>{children}</button>
  );
}
