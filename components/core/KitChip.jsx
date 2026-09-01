import React from 'react';

/** Jersey-number chip with a kit-colour swatch. flagged = the model could not read it (gold wash). */
export function KitChip({ number, name, colour = 'var(--kit-red)', flagged = false, onClick, style }) {
  return (
    <span onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 'var(--radius-pill)',
      padding: '3px 9px', fontSize: 11.5, cursor: onClick ? 'pointer' : 'default', fontFamily: 'var(--font-body)', color: 'var(--text-1)',
      ...(flagged ? { background: 'var(--gold-wash)', border: '1px solid var(--gold-wash-border)' }
                  : { background: 'var(--ink-3)', border: '1px solid var(--border-control)' }), ...style }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, border: '1px solid rgba(128,128,128,0.55)', background: colour, flex: 'none' }}></span>
      {'#' + number + (name ? ' · ' + name : '')}
    </span>
  );
}
