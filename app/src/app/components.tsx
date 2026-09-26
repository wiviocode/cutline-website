/**
 * The handful of controls every screen uses, drawn from the design system's tokens.
 */

import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";
import { thumbnails, previews, type Frame } from "./store";

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

export function Button({ kind = "secondary", small, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: ButtonKind; small?: boolean }) {
  return <button type="button" className={`btn btn-${kind}${small ? " btn-small" : ""}${className ? ` ${className}` : ""}`} {...rest}>{children}</button>;
}

export function Overline({ children }: { children: ReactNode }) {
  return <div className="overline">{children}</div>;
}

export function Field({ label, hint, children, wide }: { label: string; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field${wide ? " field-wide" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" spellCheck={false} autoComplete="off" {...props} />;
}

export function Select<T extends string>({ value, onChange, options, ariaLabel }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; ariaLabel?: string }) {
  return (
    <select className="input select" value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; title?: string }[] }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} title={o.title}
          className={`segment${o.value === value ? " segment-on" : ""}`} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Spinner() { return <span className="spinner" aria-label="Working" />; }

export function StatusDot({ frame }: { frame: Frame }) {
  const review = frame.state === "done" && !frame.approved && frame.identities.some((i) => i.status !== "confirmed");
  const cls = frame.approved ? "dot-approved" : frame.state === "failed" ? "dot-failed" : frame.state === "working" ? "dot-working" : review ? "dot-review" : frame.state === "done" ? "dot-done" : "dot-pending";
  const label = frame.approved ? "Approved" : frame.state === "failed" ? "Failed" : frame.state === "working" ? "Reading" : review ? "Check" : frame.state === "done" ? "Read" : "Not read";
  return <span className={`dot ${cls}`} title={label} aria-label={label} />;
}

/** A thumbnail that decodes when it scrolls into view. */
export function Thumb({ frame, size = "thumb" }: { frame: Frame; size?: "thumb" | "preview" }) {
  const cache = size === "thumb" ? thumbnails : previews;
  const [url, setURL] = useState<string | null>(() => cache.cached(frame.id));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (url) return;
    let live = true;
    const el = ref.current;
    if (!el) return;
    const load = () => cache.url(frame.id, frame.photo).then((u) => { if (live) setURL(u); }).catch(() => {});
    if (size === "preview") { load(); return () => { live = false; }; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: "300px" });
    io.observe(el);
    return () => { live = false; io.disconnect(); };
  }, [frame.id, frame.photo, url, cache, size]);
  useEffect(() => { setURL(cache.cached(frame.id)); }, [frame.id, cache]);
  return <div ref={ref} className={size === "thumb" ? "thumb" : "preview"}>{url ? <img src={url} alt="" draggable={false} /> : <span className="thumb-wait" />}</div>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? " modal-wide" : ""}`} role="dialog" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Mark({ size = 22 }: { size?: number }) {
  return <img src={`${import.meta.env.BASE_URL}cutline-mark.svg`} width={size} height={size} alt="" className="mark" />;
}

export function Kbd({ children }: { children: ReactNode }) { return <kbd className="kbd">{children}</kbd>; }
