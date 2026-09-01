import React from 'react';

/** macOS window chrome: traffic lights, optional title content, deep drop shadow. Wrap screens or demos in it. */
export function WindowFrame({ title, bar, children, style }) {
  return (
    <div style={{ background: 'var(--ink-1)', border: '1px solid var(--ink-3)', borderRadius: 'var(--radius-window)',
      boxShadow: 'var(--shadow-window)', overflow: 'hidden', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'var(--ink-2)', borderBottom: '1px solid var(--border-control)' }}>
        <i style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57', display: 'block' }}></i>
        <i style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e', display: 'block' }}></i>
        <i style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840', display: 'block' }}></i>
        {title ? <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-4)' }}>{title}</span> : null}
        {bar}
      </div>
      {children}
    </div>
  );
}
