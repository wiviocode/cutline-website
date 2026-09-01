import React from 'react';

/** A keyboard hint: mono key cap plus what it does. */
export function KeyChip({ k, children, style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, border: '1px solid var(--ink-3)',
      borderRadius: 'var(--radius-button)', padding: '8px 14px', fontSize: 13.5, color: 'var(--text-3)',
      fontFamily: 'var(--font-body)', ...style }}>
      <span style={{ fontFamily: 'var(--font-mono)', background: 'var(--ink-3)', borderRadius: 5, padding: '2px 8px', fontSize: 12.5, color: 'var(--text-1)' }}>{k}</span>
      {children}
    </span>
  );
}
