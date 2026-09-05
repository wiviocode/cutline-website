/**
 * Working out which page to fetch from whatever link the user pasted.
 *
 * The point is that a team link is enough. Pasting `maxpreps.com/ne/omaha/millard-south-patriots/`
 * should reach the right roster for the sport and gender already chosen, without the user
 * hunting for the roster tab. The MaxPreps path grammar, confirmed by fetching each shape:
 *
 *     /{state}/{city}/{team-slug}/                       team home
 *     /{state}/{city}/{team-slug}/{sport}/               sport home
 *     /{state}/{city}/{team-slug}/{sport}/roster/        boys roster  (gender is implicit)
 *     /{state}/{city}/{team-slug}/{sport}/girls/roster/  girls roster
 */

import type { Gender } from "../setup/GameLibrary";

export type Site = "maxPreps" | "sidearm" | "unknown";

export interface TeamPageURL {
  site: Site;
  original: URL;
  /** MaxPreps only: the `/{state}/{city}/{team-slug}` prefix every team page hangs off. */
  teamPath: string | null;
  /** Sidearm only: the `/sports/{slug}` prefix. */
  sportPath: string | null;
}

/** MaxPreps path segment for each sport this app offers. */
export const MAXPREPS_SPORT_SLUG: Record<string, string> = {
  football: "football", basketball: "basketball", volleyball: "volleyball", soccer: "soccer",
  baseball: "baseball", softball: "softball", tennis: "tennis", golf: "golf",
  trackAndField: "track-field", crossCountry: "cross-country",
};

export const TeamPageURL = {
  parse(input: string | URL): TeamPageURL | null {
    let url: URL;
    if (input instanceof URL) url = input;
    else {
      let text = input.trim();
      if (!text) return null;
      if (!/^https?:/i.test(text)) text = "https://" + text;
      try { url = new URL(text); } catch { return null; }
      if (!url.host) return null;
    }
    const host = url.host.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);

    if (host.includes("maxpreps.com")) {
      // The first three segments are state, city and team slug. Anything after is the section
      // the user happened to be looking at, and is discarded.
      if (parts.length >= 3) return { site: "maxPreps", original: url, teamPath: "/" + parts.slice(0, 3).join("/"), sportPath: null };
      return { site: "maxPreps", original: url, teamPath: null, sportPath: null };
    }

    // An API host is not an athletics site, however much its path looks like one.
    const isAPIHost = host.startsWith("api.") || host.startsWith("site.api.") || host.includes(".api.") || host.startsWith("api-");
    const i = parts.indexOf("sports");
    if (!isAPIHost && i >= 0 && i + 1 < parts.length) {
      return { site: "sidearm", original: url, teamPath: null, sportPath: "/sports/" + parts[i + 1] };
    }
    return { site: "unknown", original: url, teamPath: null, sportPath: null };
  },

  /** True when the link already points at a roster, so it can be used as-is. */
  isRosterPage(t: TeamPageURL): boolean { return t.original.pathname.toLowerCase().includes("/roster"); },

  /**
   * Roster URLs to try, best first. More than one, because gender is not addressed uniformly:
   * boys is the implicit default, and single-gender sports may not accept a `/girls/` segment.
   * The page states its own gender, so what actually came back can be checked rather than assumed.
   */
  rosterCandidates(t: TeamPageURL, sport: string, gender: Gender): string[] {
    if (TeamPageURL.isRosterPage(t)) return [t.original.toString()];
    switch (t.site) {
      case "maxPreps": {
        const slug = MAXPREPS_SPORT_SLUG[sport];
        if (!t.teamPath || !slug) return [];
        const base = `https://www.maxpreps.com${t.teamPath}/${slug}`;
        return gender === "womens" ? [`${base}/girls/roster/`, `${base}/roster/`] : [`${base}/roster/`, `${base}/girls/roster/`];
      }
      case "sidearm": {
        if (!t.sportPath) return [];
        const u = new URL(t.original.toString());
        u.pathname = t.sportPath + "/roster";
        u.search = "";
        return [u.toString()];
      }
      default:
        // Nothing is known about the site's shape, so the link is used unchanged.
        return [t.original.toString()];
    }
  },
};
