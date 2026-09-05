/**
 * Extracts usable content from what the model sends back.
 *
 * The model is asked for bare JSON, but reliably wraps it in a ```json fence often enough that
 * stripping one is cheaper than a retry. Prose replies (alt text) pass through untouched.
 */

export class ParseError extends Error {
  constructor(public readonly kind: "emptyCaption" | "unexpectedJSONObject" | "malformed", detail?: string) {
    super(kind === "emptyCaption" ? "the reply was empty"
      : kind === "unexpectedJSONObject" ? "a caption was expected but the reply is a JSON object"
      : `the reply did not match the schema: ${detail ?? ""}`);
    this.name = "ParseError";
  }
}

export const CaptionResponseParser = {
  /** Strip any markdown fence and return the inner payload. */
  unwrapFence(raw: string): string {
    const t = raw.trim();
    if (!t.startsWith("```")) return t;
    let body = t.slice(3);
    // Optional language tag on the opening fence, e.g. ```json
    const newline = body.indexOf("\n");
    if (newline >= 0) {
      const tag = body.slice(0, newline).trim();
      if (/^[A-Za-z]*$/.test(tag)) body = body.slice(newline + 1);
    }
    const close = body.lastIndexOf("```");
    if (close >= 0) body = body.slice(0, close);
    return body.trim();
  },

  /** Decode a structured payload, tolerating a fence and stray prose around the object. */
  decodeJSON(raw: string): unknown {
    const inner = CaptionResponseParser.unwrapFence(raw);
    if (!inner) throw new ParseError("emptyCaption");
    try {
      return JSON.parse(inner);
    } catch {
      const start = inner.indexOf("{"), end = inner.lastIndexOf("}");
      if (start < 0 || end <= start) throw new ParseError("malformed", inner.slice(0, 200));
      try { return JSON.parse(inner.slice(start, end + 1)); }
      catch (e) { throw new ParseError("malformed", String(e)); }
    }
  },

  /**
   * Extract a prose caption. If the payload is itself a JSON object carrying a `"caption"` key,
   * that value is lifted out; an object *without* one is rejected rather than emitting braces
   * into metadata.
   */
  prose(raw: string): string {
    const inner = CaptionResponseParser.unwrapFence(raw);
    if (!inner) throw new ParseError("emptyCaption");
    if (inner.startsWith("{")) {
      const lifted = captionValue(inner);
      if (lifted) return lifted;
      throw new ParseError("unexpectedJSONObject");
    }
    return inner;
  },
};

/** `"caption"\s*:\s*"((?:[^"\\]|\\.)*)"` — tolerates escaped quotes inside the value. */
function captionValue(s: string): string | null {
  const m = /"caption"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(s);
  if (!m || !m[1]) return null;
  return m[1].replace(/\\"/g, "\"").replace(/\\n/g, "\n").replace(/\\\//g, "/").replace(/\\\\/g, "\\");
}
