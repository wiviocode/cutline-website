import React from 'react';

/** Primary gold action, secondary control, or ghost. size "app" matches the macOS app chrome; "marketing" is the site CTA. */
export function Button({ variant = 'primary', size = 'app', disabled = false, children, onClick, style }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    fontFamily: 'var(--font-body)', fontWeight: variant === 'primary' ? 600 : 500,
    borderRadius: size === 'marketing' ? 'var(--radius-button)' : 'var(--radius-control)',
    cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap', lineHeight: 1,
    opacity: disabled ? 0.45 : 1, transition: 'background 0.18s var(--ease-brand), border-color 0.18s var(--ease-brand)',
    ...(size === 'marketing' ? { padding: '14px 28px', fontSize: 15.5 } : { height: 26, padding: '0 12px', fontSize: 12 }),
  };
  const variants = {
    primary: { background: 'var(--gold)', color: 'var(--on-gold)', border: '1px solid transparent' },
    secondary: { background: 'var(--ink-3)', color: 'var(--text-1)', border: '1px solid var(--border-control)' },
    ghost: { background: 'transparent', color: 'var(--text-1)', border: '1px solid var(--border-control)' },
  };
  const [hover, setHover] = React.useState(false);
  const hoverFx = !disabled && hover ? (variant === 'primary' ? { background: 'var(--gold-hover)' } : { background: '#333944' }) : {};
  return (
    <button onClick={disabled ? undefined : onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ ...base, ...variants[variant], ...hoverFx, ...style }}>{children}</button>
  );
}
