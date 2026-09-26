/**
 * Photo Mechanic template variable substitution.
 *
 * Grammar: `{token[:modifier[:modifier…]]}`. Implemented against the 28 golden cases the
 * original shipped in `pm_golden.json`, which are the specification.
 *
 * Modifiers:
 *  - `uc` / `UC` — uppercase, `lc` — lowercase
 *  - `tc` — title case (`new york` → `New York`)
 *  - `PC` — capitalise each word, lowercase the rest (`DSC_1234` → `Dsc_1234`)
 *  - `padN` — zero-pad to N digits
 *  - `tr:N` — truncate to N characters
 *  - `tr:<from>/<to>` — replace occurrences of `from` with `to` (`tr: /_` → spaces to underscores)
 *  - `N` — word index (usually a no-op for single-word values)
 *  - `N,M` — character substring at offset N, length M. Negative N counts from the end;
 *    negative M means "stop M characters from the end".
 *
 * An unresolvable token is left **literally in place** (`X {unknown}` → `X {unknown}`), which is
 * Photo Mechanic's behaviour and makes typos visible rather than silently blanking a field.
 */

export interface PMContext {
  iptcCity?: string;
  iptcState?: string;
  iptcCaption?: string;
  fileBaseName?: string;
  bodySerialNumber?: string;
  sessionEvent?: string;
  sessionLocation?: string;
  seqn?: number;
  /** Serial-number → photographer name, for `{photog}`. */
  codeReplacement?: Record<string, string>;
  /** Anything else, keyed by PM's own token name (`filename`, `ext`, `year4`, `suppcat1`…). */
  tokenValues?: Record<string, string>;
}

export const PMVariables = {
  /** Expand every `{…}` in `template`. */
  expand(template: string, context: PMContext = {}): string {
    let out = "";
    let i = 0;
    while (i < template.length) {
      if (template[i] !== "{") { out += template[i]; i++; continue; }
      const close = template.indexOf("}", i);
      if (close < 0) { out += template.slice(i); break; }
      const inner = template.slice(i + 1, close);
      const resolved = resolve(inner, context);
      out += resolved ?? `{${inner}}`;
      i = close + 1;
    }
    return out;
  },
};

/** Null when the token is unknown, so the caller can leave it literal. */
function resolve(expr: string, context: PMContext): string | null {
  const parts = expr.split(":");
  const token = parts.shift();
  if (token === undefined) return null;
  let value = baseValue(token, context);
  if (value == null) return null;

  let idx = 0;
  while (idx < parts.length) {
    const mod = parts[idx];
    if (mod === "tr" && idx + 1 < parts.length) {
      value = applyTr(value, parts[idx + 1]);
      idx += 2;
      continue;
    }
    value = applyModifier(value, mod);
    idx += 1;
  }
  return value;
}

function baseValue(token: string, c: PMContext): string | null {
  const tv = c.tokenValues ?? {};
  switch (token.toLowerCase()) {
    case "city":                     return c.iptcCity ?? null;
    case "state":                    return c.iptcState ?? null;
    case "caption":                  return c.iptcCaption ?? null;
    case "basename": case "filenamebase": return c.fileBaseName ?? null;
    case "serial":                   return c.bodySerialNumber ?? null;
    case "event":                    return c.sessionEvent ?? null;
    case "location":                 return c.sessionLocation ?? null;
    case "seqn":                     return c.seqn != null ? String(c.seqn) : (tv["seqn"] ?? null);
    case "photog": {
      // Resolved indirectly: the camera body serial maps to a photographer name.
      if (c.bodySerialNumber == null) return null;
      return c.codeReplacement?.[c.bodySerialNumber] ?? null;
    }
    case "file": case "filename":    return tv["filename"] ?? null;
    case "ext":                      return tv["ext"] ?? null;
    case "sup1":                     return tv["suppcat1"] ?? null;
    case "sup2":                     return tv["suppcat2"] ?? null;
    case "cat": case "category":     return tv["category"] ?? null;
    default:                         return tv[token] ?? null;
  }
}

const isInt = (s: string) => /^-?\d+$/.test(s);

function applyModifier(value: string, mod: string): string {
  // Character substring: "N,M"
  if (mod.includes(",")) {
    const bits = mod.split(",");
    if (bits.length === 2 && isInt(bits[0]) && isInt(bits[1])) {
      return substring(value, parseInt(bits[0], 10), parseInt(bits[1], 10));
    }
  }
  if (isInt(mod)) {
    const start = parseInt(mod, 10);
    // A bare number is a word index; negative counts characters from the end.
    if (start < 0) return substring(value, start, -start);
    const words = value.split(" ").filter((w) => w.length > 0);
    if (start > 0 && start < words.length) return words.slice(start).join(" ");
    return value; // word 0 (or out of range) — the whole value
  }
  if (mod.toLowerCase().startsWith("pad") && isInt(mod.slice(3))) {
    const width = parseInt(mod.slice(3), 10);
    return "0".repeat(Math.max(0, width - value.length)) + value;
  }
  switch (mod) {
    case "uc": case "UC": return value.toUpperCase();
    case "lc": case "LC": return value.toLowerCase();
    case "tc": case "TC": return titleCase(value);
    case "PC": case "pc": return titleCase(value);
    default: return value;
  }
}

/** `tr:N` truncates; `tr:<from>/<to>` replaces. */
function applyTr(value: string, arg: string): string {
  if (isInt(arg)) return Array.from(value).slice(0, parseInt(arg, 10)).join("");
  const slash = arg.indexOf("/");
  if (slash < 0) return value;
  const from = arg.slice(0, slash);
  const to = arg.slice(slash + 1);
  if (!from) return value;
  return value.split(from).join(to);
}

function substring(s: string, start: number, length: number): string {
  const chars = Array.from(s);
  const from = start < 0 ? Math.max(0, chars.length + start) : Math.min(start, chars.length);
  // A negative length means "stop that many characters before the end".
  const to = length < 0 ? Math.max(from, chars.length + length) : Math.min(from + length, chars.length);
  if (from >= to) return "";
  return chars.slice(from, to).join("");
}

function titleCase(s: string): string {
  return s.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "")).join(" ");
}
