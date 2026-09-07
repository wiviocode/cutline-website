/**
 * The design system's primitives, as CSS classes. Nothing here keeps hover state in React: a
 * colour change is the stylesheet's job, so no component re-renders to show one.
 */

import React, { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type MouseEventHandler, type KeyboardEventHandler, type ChangeEventHandler } from "react";
import { createPortal } from "react-dom";

type ButtonProps = {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg";
  disabled?: boolean;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  style?: CSSProperties;
  title?: string;
  type?: "button" | "submit";
  autoFocus?: boolean;
  className?: string;
};

export function Button({ variant = "primary", size = "md", disabled = false, children, onClick, style, title, type = "button", autoFocus, className }: ButtonProps) {
  return (
    <button type={type} title={title} disabled={disabled} onClick={disabled ? undefined : onClick} autoFocus={autoFocus} style={style}
      className={`btn btn-${variant} btn-${size}${className ? " " + className : ""}`}>{children}</button>
  );
}

/** A label above a control, with an optional one-line hint below. */
export function Field({ label, hint, children, className, style }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <label className={"field" + (className ? " " + className : "")} style={style}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function TextInput({ value, onChange, placeholder, mono = false, autoFocus = false, onKeyDown, style, type = "text", spellCheck, disabled, ariaLabel, autoComplete = "off" }:
  { value: string; onChange: ChangeEventHandler<HTMLInputElement>; placeholder?: string; mono?: boolean; autoFocus?: boolean; onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
    style?: CSSProperties; type?: string; spellCheck?: boolean; disabled?: boolean; ariaLabel?: string; autoComplete?: string }) {
  return (
    <input className={"input" + (mono ? " mono" : "")} value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} onKeyDown={onKeyDown}
      type={type} spellCheck={spellCheck} disabled={disabled} aria-label={ariaLabel} autoComplete={autoComplete} style={style} />
  );
}

export function TextArea({ value, onChange, placeholder, minHeight = 96, autoFocus = false, onKeyDown, onBlur, style, rows, ariaLabel }:
  { value: string; onChange: ChangeEventHandler<HTMLTextAreaElement>; placeholder?: string; minHeight?: number; autoFocus?: boolean;
    onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>; onBlur?: () => void; style?: CSSProperties; rows?: number; ariaLabel?: string }) {
  return (
    <textarea className="input textarea" value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} onKeyDown={onKeyDown} onBlur={onBlur}
      spellCheck rows={rows} aria-label={ariaLabel} style={{ minHeight, ...style }} />
  );
}

export interface SelectOption<T extends string> {
  id: T;
  name: string;
  /** A heading the option sits under, in order of first appearance. */
  group?: string;
  /** Not a value but something to do — "Add a level…" — kept below the list, shown whatever the filter. */
  action?: boolean;
}

/**
 * The app's dropdown: a trigger in the style of an input, and a popover in the style of a menu
 * with the options under their headings. A list longer than a handful gets a filter box that
 * takes focus as it opens, so the way to pick "Junior college" from fifteen levels is to type
 * "jun" and press Return. Arrows move, Return picks, Escape closes; typing on a short list jumps
 * to the first option that starts with the letter, as a native select does.
 *
 * The popover is rendered at the document's root and placed by the trigger's position, so it is
 * never clipped by a scrolling sheet, and it opens upward when there is more room above.
 */
export function Select<T extends string>({ value, options, onChange, style, disabled, ariaLabel, searchable, placeholder = "Choose…" }:
  { value: T; options: SelectOption<T>[]; onChange: (v: T) => void; style?: CSSProperties; disabled?: boolean; ariaLabel?: string; searchable?: boolean; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listBox = useRef<HTMLDivElement>(null);
  const id = useId();

  const current = options.find((o) => o.id === value && !o.action);
  const canSearch = searchable ?? options.filter((o) => !o.action).length > 6;
  const q = query.trim().toLowerCase();
  const matches = (o: SelectOption<T>) => !q || o.name.toLowerCase().includes(q) || (o.group ?? "").toLowerCase().includes(q);
  const regular = options.filter((o) => !o.action && matches(o));
  const actions = options.filter((o) => o.action);
  const rows = [...regular, ...actions];
  const groups = [...new Set(regular.map((o) => o.group ?? ""))];

  const measure = () => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 320 && r.top > below;
    setPlace({ top: up ? r.top - 4 : r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 240) - 8)), width: Math.max(r.width, 240), up });
  };
  const show = (seed = "") => {
    if (disabled) return;
    measure();
    setQuery(seed);
    setActive(seed ? 0 : Math.max(0, options.filter((o) => !o.action).findIndex((o) => o.id === value)));
    setOpen(true);
  };
  const hide = (refocus: boolean) => { setOpen(false); setQuery(""); if (refocus) trigger.current?.focus(); };
  const choose = (o: SelectOption<T>) => { hide(true); if (o.action || o.id !== value) onChange(o.id); };

  useEffect(() => {
    if (!open) return;
    (canSearch ? search.current : listBox.current)?.focus();
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (pop.current?.contains(t) || trigger.current?.contains(t)) return; hide(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    pop.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const move = (delta: number) => setActive((a) => Math.min(Math.max(a + delta, 0), Math.max(rows.length - 1, 0)));
  const onKey = (e: React.KeyboardEvent) => {
    switch (keyOf(e)) {
      case "ArrowDown": e.preventDefault(); move(1); break;
      case "ArrowUp": e.preventDefault(); move(-1); break;
      case "Home": e.preventDefault(); setActive(0); break;
      case "End": e.preventDefault(); setActive(Math.max(rows.length - 1, 0)); break;
      case "PageDown": e.preventDefault(); move(8); break;
      case "PageUp": e.preventDefault(); move(-8); break;
      case "Enter": { e.preventDefault(); const o = rows[active]; if (o) choose(o); break; }
      case "Escape": e.preventDefault(); e.stopPropagation(); hide(true); break;
      case "Tab": hide(false); break;
      default:
        // A short list has no filter box: a letter jumps to the first option that starts with it.
        if (!canSearch && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const i = rows.findIndex((o) => !o.action && o.name.toLowerCase().startsWith(e.key.toLowerCase()));
          if (i >= 0) setActive(i);
        }
    }
  };
  const onTriggerKey = (e: React.KeyboardEvent) => {
    const key = keyOf(e);
    if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") { e.preventDefault(); show(); }
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); show(canSearch ? e.key : ""); if (!canSearch) { const i = options.filter((o) => !o.action).findIndex((o) => o.name.toLowerCase().startsWith(e.key.toLowerCase())); if (i >= 0) setActive(i); } }
  };

  let index = -1;
  const row = (o: SelectOption<T>) => {
    index += 1;
    const i = index;
    return (
      <div key={o.id} id={`${id}-${i}`} data-index={i} role="option" aria-selected={o.id === value && !o.action}
        className={"combo-opt" + (i === active ? " on" : "") + (o.id === value && !o.action ? " sel" : "") + (o.action ? " act" : "")}
        onMouseMove={() => { if (active !== i) setActive(i); }} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}>
        {o.action && <span className="combo-plus" aria-hidden="true">+</span>}
        <span className="combo-name">{emphasise(o.name, q)}</span>
        {o.id === value && !o.action && <span className="combo-tick" aria-hidden="true">✓</span>}
      </div>
    );
  };

  return (
    <>
      <button ref={trigger} type="button" className="input select combo-trigger" style={style} disabled={disabled} aria-label={ariaLabel}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined}
        onMouseDown={(e) => { e.preventDefault(); if (open) hide(true); else show(); }} onKeyDown={onTriggerKey}>
        <span className={"combo-value" + (current ? "" : " placeholder")}>{current?.name ?? placeholder}</span>
      </button>
      {open && place && createPortal(
        <div ref={pop} className={"combo-pop" + (place.up ? " up" : "")} onKeyDown={onKey}
          style={place.up ? { bottom: window.innerHeight - place.top, left: place.left, width: place.width } : { top: place.top, left: place.left, width: place.width }}>
          {canSearch && (
            <input ref={search} className="combo-search" value={query} placeholder="Type to filter…" autoComplete="off" spellCheck={false}
              role="combobox" aria-expanded aria-controls={`${id}-list`} aria-autocomplete="list" aria-label={`Filter ${ariaLabel ?? "the list"}`}
              aria-activedescendant={rows[active] ? `${id}-${active}` : undefined}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }} />
          )}
          <div ref={listBox} id={`${id}-list`} className="combo-list" role="listbox" aria-label={ariaLabel} tabIndex={canSearch ? -1 : 0}
            aria-activedescendant={!canSearch && rows[active] ? `${id}-${active}` : undefined}>
            {groups.map((g) => (
              <React.Fragment key={g || "\u0000"}>
                {g && <div className="combo-group" role="presentation">{g}</div>}
                {regular.filter((o) => (o.group ?? "") === g).map(row)}
              </React.Fragment>
            ))}
            {regular.length === 0 && !actions.some(matches) && <div className="combo-empty">Nothing matches "{query.trim()}".</div>}
            {actions.length > 0 && <div className="combo-actions" role="presentation">{actions.map(row)}</div>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** The key by name, falling back to the physical code for input methods that send none. */
function keyOf(e: React.KeyboardEvent): string {
  if (e.key) return e.key === "NumpadEnter" ? "Enter" : e.key;
  const code = e.code;
  if (code === "NumpadEnter") return "Enter";
  if (code === "Space") return " ";
  return code;
}

/** The matched part of a name, marked, so the eye finds why a row is there. */
function emphasise(name: string, q: string): ReactNode {
  if (!q) return name;
  const at = name.toLowerCase().indexOf(q);
  if (at < 0) return name;
  return <>{name.slice(0, at)}<mark>{name.slice(at, at + q.length)}</mark>{name.slice(at + q.length)}</>;
}

export function Switch({ on, onChange, disabled, ariaLabel }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; ariaLabel?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={ariaLabel} disabled={disabled} className={"switch" + (on ? " on" : "")} onClick={() => onChange(!on)}>
      <span className="knob" />
    </button>
  );
}

/** Compact segmented filter; the active segment is gold. */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; ariaLabel?: string }) {
  return (
    <div className="seg" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button type="button" role="tab" aria-selected={o.id === value} key={o.id} className={o.id === value ? "on" : ""} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

/** A list of choices where each needs a sentence — house styles, models. */
export function RadioCards<T extends string>({ options, value, onChange, name }:
  { options: { id: T; title: ReactNode; detail?: ReactNode; aside?: ReactNode }[]; value: T; onChange: (v: T) => void; name: string }) {
  return (
    <div className="rcards" role="radiogroup">
      {options.map((o) => (
        <label key={o.id} className={"rcard" + (o.id === value ? " on" : "")}>
          <input type="radio" name={name} value={o.id} checked={o.id === value} onChange={() => onChange(o.id)} />
          <span className="rcard-dot" aria-hidden="true" />
          <span className="rcard-main">
            <span className="rcard-title">{o.title}{o.aside && <span className="rcard-aside">{o.aside}</span>}</span>
            {o.detail && <span className="rcard-detail">{o.detail}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

/** Uppercase mono section label. */
export function Overline({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return <div className={"overline" + (className ? " " + className : "")} style={style}>{children}</div>;
}

/** Jersey-number chip with a kit-colour swatch. flagged = the model could not read it. */
export function KitChip({ number, name, colour = "var(--kit-red)", flagged = false, onClick, title }:
  { number: string; name?: string | null; colour?: string; flagged?: boolean; onClick?: () => void; title?: string }) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} title={title} className={"chip" + (flagged ? " flagged" : "")}>
      <span className="chip-swatch" style={{ background: colour }} />
      {"#" + number + (name ? " · " + name : "")}
    </Tag>
  );
}

/** The brand mark. */
export function Mark({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden="true" style={{ display: "block", borderRadius: size * 0.2237, flex: "none" }}>
      <rect width="128" height="128" rx="29" fill="#15181d" />
      <rect x="26" y="26" width="76" height="50" rx="4" fill="#8d97a5" />
      <rect x="26" y="88" width="76" height="9" rx="3" fill="#e8b00a" />
      <rect x="26" y="103" width="47" height="9" rx="3" fill="#4a525e" />
    </svg>
  );
}

/** A small crest: the logo when there is one, else initials on the kit colour. */
export function Crest({ name, colour, logoURL, size = 22 }: { name: string; colour: string; logoURL?: string | null; size?: number }) {
  if (logoURL) return <img src={logoURL} alt="" className="crest crest-logo" style={{ width: size, height: size, borderRadius: size * 0.23 }} />;
  const words = name.split(" ").filter(Boolean);
  const initials = words.length > 1 ? words.slice(0, 3).map((w) => w[0]).join("").toUpperCase() : name.slice(0, 3).toUpperCase() || "—";
  return (
    <span className="crest" style={{ width: size, height: size, borderRadius: size * 0.23, fontSize: Math.round(size * 0.39), background: swatchColour(colour), color: isLight(colour) ? "#000" : "#fff" }}>{initials}</span>
  );
}

/**
 * A modal sheet: head, scrolling body, optional foot. Escape and a click on the backdrop close
 * it unless it is busy. Focus goes into it on open and returns to where it was on close.
 */
export function Sheet({ title, onClose, children, footer, size = "md", busy = false, label }:
  { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg"; busy?: boolean; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>("input, textarea, select, button:not(.sheet-close)");
    (first ?? box.current)?.focus();
    return () => previous?.focus?.();
  }, []);
  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} tabIndex={-1} className={`sheet sheet-${size}`} role="dialog" aria-modal="true" aria-label={label ?? (typeof title === "string" ? title : undefined)}
        onKeyDown={(e) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); onClose(); } }}>
        <header className="sheet-head">
          <h1>{title}</h1>
          <span className="spacer" />
          <button type="button" className="sheet-close" aria-label="Close" disabled={busy} onClick={onClose}>×</button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** A button that opens a short list of rarer actions. Closes on a click elsewhere or Escape. */
export function Menu({ label, items }: { label: ReactNode; items: { label: string; onSelect: () => void; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey, true); };
  }, [open]);
  return (
    <div className="menu" ref={box}>
      <button type="button" className="btn btn-secondary btn-md" aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.currentTarget.blur(); setOpen((o) => !o); }}>{label} <span aria-hidden="true">▾</span></button>
      {open && (
        <div className="menu-list" role="menu">
          {items.map((it) => <button key={it.label} type="button" role="menuitem" disabled={it.disabled} onClick={() => { setOpen(false); it.onSelect(); }}>{it.label}</button>)}
        </div>
      )}
    </div>
  );
}

/** A callout in the flow: a warning, a stop, or a note. */
export function Callout({ kind = "warn", children, actions }: { kind?: "warn" | "stop" | "note"; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className={`callout callout-${kind}`} role={kind === "note" ? undefined : "status"}>
      <span className="callout-glyph" aria-hidden="true">{kind === "stop" ? "!" : kind === "warn" ? "!" : "i"}</span>
      <div className="callout-body">{children}{actions && <div className="callout-actions">{actions}</div>}</div>
    </div>
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

export { React };
