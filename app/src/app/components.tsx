/**
 * The design system's primitives, from the website repo's UI kit, typed.
 *
 * Values are the ones the kit distilled from the site and the app — not invented here.
 */

import React, { useState, type CSSProperties, type ReactNode, type MouseEventHandler, type KeyboardEventHandler, type ChangeEventHandler } from "react";

type ButtonProps = {
  variant?: "primary" | "secondary" | "ghost";
  size?: "app" | "marketing";
  disabled?: boolean;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  style?: CSSProperties;
  title?: string;
  type?: "button" | "submit";
};

/** Primary gold action, secondary control, or ghost. */
export function Button({ variant = "primary", size = "app", disabled = false, children, onClick, style, title, type = "button" }: ButtonProps) {
  const [hover, setHover] = useState(false);
  const base: CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    fontFamily: "var(--font-body)", fontWeight: variant === "primary" ? 600 : 500,
    borderRadius: size === "marketing" ? "var(--radius-button)" : "var(--radius-control)",
    cursor: disabled ? "default" : "pointer", whiteSpace: "nowrap", lineHeight: 1,
    opacity: disabled ? 0.45 : 1, transition: "background 0.18s var(--ease-brand), border-color 0.18s var(--ease-brand)",
    ...(size === "marketing" ? { padding: "14px 28px", fontSize: 15.5 } : { height: 26, padding: "0 12px", fontSize: 12 }),
  };
  const variants: Record<string, CSSProperties> = {
    primary: { background: "var(--gold)", color: "var(--on-gold)", border: "1px solid transparent" },
    secondary: { background: "var(--ink-3)", color: "var(--text-1)", border: "1px solid var(--border-control)" },
    ghost: { background: "transparent", color: "var(--text-1)", border: "1px solid var(--border-control)" },
  };
  const hoverFx: CSSProperties = !disabled && hover ? (variant === "primary" ? { background: "var(--gold-hover)" } : { background: "#333944" }) : {};
  return (
    <button type={type} title={title} disabled={disabled} onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ ...base, ...variants[variant], ...hoverFx, ...style }}>{children}</button>
  );
}

/** Jersey-number chip with a kit-colour swatch. flagged = the model could not read it. */
export function KitChip({ number, name, colour = "var(--kit-red)", flagged = false, onClick, style, title }:
  { number: string; name?: string | null; colour?: string; flagged?: boolean; onClick?: () => void; style?: CSSProperties; title?: string }) {
  return (
    <span onClick={onClick} title={title} style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: "var(--radius-pill)",
      padding: "3px 9px", fontSize: 11.5, cursor: onClick ? "pointer" : "default", fontFamily: "var(--font-body)", color: "var(--text-1)",
      ...(flagged ? { background: "var(--gold-wash)", border: "1px solid var(--gold-wash-border)" }
                  : { background: "var(--ink-3)", border: "1px solid var(--border-control)" }), ...style }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, border: "1px solid rgba(128,128,128,0.55)", background: colour, flex: "none" }} />
      {"#" + number + (name ? " · " + name : "")}
    </span>
  );
}

/** Uppercase mono section label. */
export function Overline({ children, size = 10, tracking = "0.05em", style }: { children: ReactNode; size?: number; tracking?: string; style?: CSSProperties }) {
  return <div style={{ fontFamily: "var(--font-mono)", fontSize: size, fontWeight: 600, letterSpacing: tracking, textTransform: "uppercase", color: "var(--text-4)", ...style }}>{children}</div>;
}

/** Pill-shaped tab; the active one is solid gold. */
export function PillTab({ active = false, children, onClick, style }: { active?: boolean; children: ReactNode; onClick?: () => void; style?: CSSProperties }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      borderRadius: "var(--radius-pill)", padding: "6px 15px", fontFamily: "var(--font-mono)", fontSize: 12,
      cursor: "pointer", lineHeight: 1.3, transition: "color 0.18s var(--ease-brand)",
      ...(active
        ? { border: "1px solid var(--gold)", background: "var(--gold)", color: "var(--on-gold)", fontWeight: 600 }
        : { border: "1px solid var(--border-control)", background: "transparent", color: hover ? "var(--text-1)" : "var(--text-4)" }),
      ...style,
    }}>{children}</button>
  );
}

/** A keyboard hint: mono key cap plus what it does. */
export function KeyChip({ k, children, style }: { k: string; children?: ReactNode; style?: CSSProperties }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-body)", ...style }}>
      <span style={{ fontFamily: "var(--font-mono)", background: "var(--ink-3)", borderRadius: 4, padding: "1px 6px", fontSize: 10.5, color: "var(--text-1)" }}>{k}</span>
      {children}
    </span>
  );
}

/** Compact segmented filter. Active segment is gold. */
export function Segmented<T extends string>({ options, value, onChange, style }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", background: "var(--ink-3)", borderRadius: "var(--radius-control)", padding: 2, gap: 2, ...style }}>
      {options.map((o) => (
        <button type="button" key={o.id} onClick={() => onChange(o.id)} style={{
          border: 0, fontFamily: "var(--font-body)", fontSize: 12, padding: "3px 11px", borderRadius: 4, cursor: "pointer",
          ...(o.id === value ? { background: "var(--gold)", color: "var(--on-gold)", fontWeight: 600 } : { background: "none", color: "var(--text-4)" }),
        }}>{o.label}</button>
      ))}
    </div>
  );
}

/** Single-line input; gold border when focused. Mono for numeric/filename values. */
export function TextInput({ value, onChange, placeholder, mono = false, autoFocus = false, onKeyDown, style, type = "text", spellCheck, disabled }:
  { value: string; onChange: ChangeEventHandler<HTMLInputElement>; placeholder?: string; mono?: boolean; autoFocus?: boolean;
    onKeyDown?: KeyboardEventHandler<HTMLInputElement>; style?: CSSProperties; type?: string; spellCheck?: boolean; disabled?: boolean }) {
  const [focus, setFocus] = useState(false);
  return (
    <input value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} onKeyDown={onKeyDown} type={type} spellCheck={spellCheck} disabled={disabled}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} autoComplete="off"
      style={{ background: "var(--ink-3)", color: "var(--text-1)", border: "1px solid " + (focus ? "var(--gold)" : "var(--border-control)"),
        borderRadius: "var(--radius-control)", padding: "6px 9px", outline: "none", width: "100%", boxSizing: "border-box",
        font: mono ? "13px/1.2 var(--font-mono)" : "12.5px/1.4 var(--font-body)", opacity: disabled ? 0.5 : 1, ...style }} />
  );
}

/** Multi-line editor (captions, notes to the model); gold border while focused. */
export function TextArea({ value, onChange, placeholder, minHeight = 110, autoFocus = false, onKeyDown, onBlur, style, rows }:
  { value: string; onChange: ChangeEventHandler<HTMLTextAreaElement>; placeholder?: string; minHeight?: number; autoFocus?: boolean;
    onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>; onBlur?: () => void; style?: CSSProperties; rows?: number }) {
  const [focus, setFocus] = useState(false);
  return (
    <textarea value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} onKeyDown={onKeyDown} spellCheck rows={rows}
      onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); onBlur?.(); }}
      style={{ width: "100%", minHeight, resize: "none", boxSizing: "border-box", background: "var(--ink-3)", color: "var(--text-1)",
        border: "1px solid " + (focus ? "var(--gold)" : "var(--border-control)"), borderRadius: "var(--radius-card)",
        padding: 10, lineHeight: 1.5, fontFamily: "var(--font-body)", fontSize: 12.5, outline: "none", ...style }} />
  );
}

/** A labelled select in the app's chrome. */
export function Select<T extends string>({ value, options, onChange, style, disabled }: { value: T; options: { id: T; name: string }[]; onChange: (v: T) => void; style?: CSSProperties; disabled?: boolean }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}
      style={{ background: "var(--ink-3)", color: "var(--text-1)", border: "1px solid var(--border-control)", borderRadius: "var(--radius-control)",
        padding: "5px 9px", font: "12px/1.4 var(--font-body)", cursor: "pointer", maxWidth: 260, ...style }}>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

/** A switch, for the two settings that change what gets written to the photographs. */
export function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      style={{ width: 36, height: 21, borderRadius: 11, flex: "none", position: "relative", padding: 0, cursor: disabled ? "default" : "pointer",
        background: on ? "var(--gold)" : "#3a4048", border: "1px solid " + (on ? "var(--gold)" : "var(--border-control)"), transition: "background .13s ease", opacity: disabled ? 0.5 : 1 }}>
      <span style={{ position: "absolute", top: 2, left: 2, width: 15, height: 15, borderRadius: "50%", background: on ? "#241c00" : "#cfd5dd",
        transform: on ? "translateX(15px)" : "none", transition: "transform .13s ease, background .13s ease" }} />
    </button>
  );
}

/** The brand mark. */
export function Mark({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden="true" style={{ display: "block", borderRadius: size * 0.2237 }}>
      <rect width="128" height="128" rx="29" fill="#15181d" />
      <rect x="26" y="26" width="76" height="50" rx="4" fill="#8d97a5" />
      <rect x="26" y="88" width="76" height="9" rx="3" fill="#e8b00a" />
      <rect x="26" y="103" width="47" height="9" rx="3" fill="#4a525e" />
    </svg>
  );
}

/** A small crest: the logo when there is one, else initials on the kit colour. */
export function Crest({ name, colour, logoURL, size = 22 }: { name: string; colour: string; logoURL?: string | null; size?: number }) {
  if (logoURL) {
    return <img src={logoURL} alt="" style={{ width: size, height: size, borderRadius: size * 0.23, objectFit: "contain", padding: 2, background: "rgba(255,255,255,0.06)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.14)" }} />;
  }
  const words = name.split(" ").filter(Boolean);
  const initials = words.length > 1 ? words.slice(0, 3).map((w) => w[0]).join("").toUpperCase() : name.slice(0, 3).toUpperCase() || "—";
  return (
    <span style={{ width: size, height: size, borderRadius: size * 0.23, display: "grid", placeItems: "center", font: `700 ${Math.round(size * 0.39)}px/1 var(--font-mono)`,
      background: swatchColour(colour), color: isLight(colour) ? "#000" : "#fff", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.14)", flex: "none" }}>{initials}</span>
  );
}

const NAMED: Record<string, string> = {
  white: "#e9ecf0", cream: "#f1e8d0", ivory: "#f4efe1", silver: "#c0c5cc", black: "#111417", charcoal: "#2b2f35",
  blue: "#1f4ee0", navy: "#0f2a5e", royal: "#2a55d6", red: "#b3202c", crimson: "#a8112a", scarlet: "#d1232a", maroon: "#6b1a2b",
  green: "#1e7a3c", forest: "#154734", kelly: "#2ea043", yellow: "#e8c11c", gold: "#e8b00a", orange: "#f47321", purple: "#5b2b82", violet: "#7a3fb8",
  grey: "#8b939f", gray: "#8b939f", graphite: "#5a626e", pink: "#e26aa8", brown: "#7b3f00", teal: "#188a8a",
};
export function swatchColour(c: string): string { return NAMED[c.trim().toLowerCase()] ?? "#8b939f"; }
export function isLight(c: string): boolean { return ["white", "cream", "ivory", "silver", "yellow", "gold", "pink"].includes(c.trim().toLowerCase()); }
