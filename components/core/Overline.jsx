import React from 'react';

/** Uppercase mono section label. */
export function Overline({ children, size = 10, tracking = '0.05em', style }) {
  return <div style={{ fontFamily: 'var(--font-mono)', fontSize: size, fontWeight: 600, letterSpacing: tracking,
    textTransform: 'uppercase', color: 'var(--text-4)', ...style }}>{children}</div>;
}
