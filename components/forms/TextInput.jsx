import React from 'react';

/** Single-line input; gold border when focused/editing. Mono for numeric/filename values. */
export function TextInput({ value, onChange, placeholder, mono = false, autoFocus = false, onKeyDown, style }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <input value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} onKeyDown={onKeyDown}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} autoComplete="off"
      style={{ background: 'var(--ink-3)', color: 'var(--text-1)', border: '1px solid ' + (focus ? 'var(--gold)' : 'var(--border-control)'),
        borderRadius: 'var(--radius-control)', padding: '6px 9px', outline: 'none', width: '100%', boxSizing: 'border-box',
        font: (mono ? '13px/1.2 var(--font-mono)' : '12.5px/1.4 var(--font-body)'), ...style }} />
  );
}
