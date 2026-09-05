/**
 * Reading a team's identity off its own page.
 *
 *  - **MaxPreps** embeds a Next.js payload with a `teamContext.data` block holding the school
 *    name, mascot, mascot image and published colours. Structured data, read directly.
 *  - **Sidearm** sites (huskers.com and most college athletics sites) publish no such block.
 *    Only Open Graph tags and the touch icon are available, so the name is derived from
 *    `og:site_name` and there are no colours to read.
 */

import { TeamIdentity, HexColour } from "./TeamIdentity";
import { APState } from "../caption/USState";

export const TeamPageParser = {
  parse(html: string, source: string): TeamIdentity | null {
    return TeamPageParser.maxPreps(html, source) ?? TeamPageParser.openGraph(html, source);
  },

  /** The payload is JSON in a known script tag, so it is decoded rather than pattern-matched. */
  maxPreps(html: string, source: string): TeamIdentity | null {
    const json = nextDataPayload(html);
    if (!json) return null;
    let root: unknown;
    try { root = JSON.parse(json); } catch { return null; }
    const data = ((((root as Record<string, unknown>)?.props as Record<string, unknown>)?.pageProps as Record<string, unknown>)
      ?.teamContext as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    if (!data) return null;
    const text = (key: string): string | null => {
      const v = data[key];
      if (typeof v !== "string") return null;
      const t = v.trim();
      return t ? t : null;
    };
    const school = text("schoolName");
    if (!school) return null;
    // schoolColor3 is written as spaces when unset, so blanks are dropped rather than parsed.
    const colours = ["schoolColor1", "schoolColor2", "schoolColor3"].map(text)
      .filter((c): c is string => c != null && HexColour.components(c) != null);
    const state = text("stateName");
    return TeamIdentity.make({
      schoolName: school,
      mascot: text("schoolMascot"),
      city: text("schoolMailingCity"),
      state: state ? APState.apStyle(state) : null,
      logoURL: text("schoolMascotUrl"),
      colorHexes: colours,
      reportedGender: text("gender"),
      sportSeason: text("sportSeasonName"),
      sourceURL: source,
      rosterURL: source,
    });
  },

  /**
   * Best effort for sites with no structured team block. `og:site_name` on a college athletics
   * site names the institution ("University of Nebraska - Official Athletics Website"), so the
   * trailing boilerplate is stripped. No mascot and no colours are available, and none are invented.
   */
  openGraph(html: string, source: string): TeamIdentity | null {
    const raw = metaContent(html, "og:site_name") ?? metaContent(html, "og:title") ?? documentTitle(html);
    if (!raw) return null;
    const name = cleanSiteName(raw);
    if (!name) return null;
    return TeamIdentity.make({
      schoolName: name,
      logoURL: appleTouchIcon(html) ?? metaContent(html, "og:image"),
      sourceURL: source,
      rosterURL: source,
    });
  },

  cleanSiteName,
};

/** Found by scanning from the opening tag rather than with a regex: the payload is hundreds of kilobytes. */
function nextDataPayload(html: string): string | null {
  const open = html.indexOf('<script id="__NEXT_DATA__"');
  if (open < 0) return null;
  const bodyStart = html.indexOf(">", open);
  if (bodyStart < 0) return null;
  const close = html.indexOf("</script>", bodyStart + 1);
  if (close < 0) return null;
  return html.slice(bodyStart + 1, close);
}

/** "University of Nebraska - Official Athletics Website" -> "Nebraska". */
function cleanSiteName(raw: string): string {
  let s = raw;
  for (const sep of [" - ", " | ", " – "]) { const i = s.indexOf(sep); if (i >= 0) s = s.slice(0, i); }
  for (const prefix of ["University of ", "The University of "]) if (s.startsWith(prefix)) s = s.slice(prefix.length);
  for (const suffix of [" Athletics", " Official Athletics Website"]) if (s.endsWith(suffix)) s = s.slice(0, -suffix.length);
  return s.trim();
}

function metaContent(html: string, property: string): string | null {
  const p = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${p}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

function appleTouchIcon(html: string): string | null {
  const tag = /<link[^>]*apple-touch-icon[^>]*>/i.exec(html)?.[0];
  if (!tag) return null;
  const href = /href=["']([^"']*)["']/i.exec(tag);
  return href ? href[1] : null;
}

function documentTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return m ? m[1].trim() : null;
}
