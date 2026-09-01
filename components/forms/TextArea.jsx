import React from 'react';

/** Multi-line editor (captions, notes to the model); gold border while focused. */
export function TextArea({ value, onChange, placeholder, minHeight = 110, autoFocus = false, onKeyDown, style }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <textarea value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} onKeyDown={onKeyDown}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} spellCheck
      style={{ width: '100%', minHeight, resize: 'none', boxSizing: 'border-box', background: 'var(--ink-3)', color: 'var(--text-1)',
        border: '1px solid ' + (focus ? 'var(--gold)' : 'var(--border-control)'), borderRadius: 'var(--radius-card)',
        padding: 10, lineHeight: 1.5, fontFamily: 'var(--font-body)', fontSize: 12.5, outline: 'none', ...style }} />
  );
}
