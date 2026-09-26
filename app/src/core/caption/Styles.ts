/**
 * How each desk writes the parts of a caption that are not the sentence about the play.
 *
 * Carried over from the first Cutline, whose rules came from Hurrdat's style guide and a survey
 * of published wire captions, with one correction: AP names a player's school without the
 * nickname ("Nebraska quarterback Anthony Colandrea (10)"), which is what AP runs and what the
 * desks using this app file.
 */

export type CaptionStyle = "apSports" | "hurrdatSports" | "gettySports" | "gettySportsParen" | "imagnImages" | "iconSports" | "simple";
export type MonthForm = "apAbbreviated" | "full" | "threeLetter";
export type StateForm = "apAbbreviation" | "fullName" | "postal";

export const CAPTION_STYLES: CaptionStyle[] = ["apSports", "hurrdatSports", "gettySports", "gettySportsParen", "imagnImages", "iconSports", "simple"];

const GETTY_LIKE = new Set<CaptionStyle>(["gettySports", "gettySportsParen", "iconSports"]);

export const Styles = {
  monthForm(s: CaptionStyle): MonthForm {
    if (GETTY_LIKE.has(s)) return "full";
    if (s === "imagnImages") return "threeLetter";
    return "apAbbreviated";
  },
  stateForm(s: CaptionStyle): StateForm {
    if (GETTY_LIKE.has(s)) return "fullName";
    if (s === "imagnImages") return "postal";
    return "apAbbreviation";
  },
  /** AP and Hurrdat set the date off with commas and name the weekday; Getty and Icon run it on with "on". */
  datesAreAppositive(s: CaptionStyle): boolean { return s === "apSports" || s === "hurrdatSports" || s === "simple"; },
  includesWeekday(s: CaptionStyle): boolean { return s === "apSports" || s === "hurrdatSports"; },
  /** Getty, Icon, Imagn and Hurrdat name the ground. AP leaves it out. */
  namesVenue(s: CaptionStyle): boolean { return s !== "apSports" && s !== "simple"; },
  /** Hurrdat puts the opponent ahead of the game clause, from the worked example in their guide. */
  opponentPrecedesGameClause(s: CaptionStyle): boolean { return s === "hurrdatSports"; },
  /** AP names the governing body: "an NCAA college football game". */
  namesGoverningBody(s: CaptionStyle): boolean { return s === "apSports"; },
  hasDateline(s: CaptionStyle): boolean { return s === "iconSports"; },
  isDelimitedRecord(s: CaptionStyle): boolean { return s === "imagnImages"; },
  includesPosition(s: CaptionStyle): boolean { return s === "apSports" || s === "imagnImages"; },
  /** Hurrdat writes the team singular ahead of a name: "Waverly Viking Gracie Lauenstein (3)". */
  usesSingularTeamBeforeName(s: CaptionStyle): boolean { return s === "hurrdatSports"; },
  jerseyNumberIsParenthesised(s: CaptionStyle): boolean { return !(s === "gettySports" || s === "iconSports"); },
  /** Getty: "Name #5 of the Kentucky Wildcats". */
  usesOfTheTeamForm(s: CaptionStyle): boolean { return GETTY_LIKE.has(s); },
  /** Whether the nickname travels with the school when a team is named. AP: school alone. */
  namesNickname(s: CaptionStyle): boolean { return s !== "apSports" && s !== "simple"; },

  creditLine(s: CaptionStyle, photographer: string | null | undefined, house?: string | null): string | null {
    const name = photographer?.trim();
    if (!name) return null;
    const own = house?.trim() || null;
    switch (s) {
      case "apSports": return `(${own ?? "AP Photo"}/${name})`;
      case "gettySports":
      case "gettySportsParen": return `(Photo by ${name}/${own ?? "Getty Images"})`;
      case "iconSports": return `(Photo by ${name}/${own ?? "Icon Sportswire via Getty Images"})`;
      case "imagnImages": return `Mandatory Credit: ${name}-${own ?? "Imagn Images"}`;
      case "hurrdatSports": return own ? `Photo by ${name}/${own}.` : `Photo by ${name}.`;
      case "simple": return null;
    }
  },

  defaultHouse(s: CaptionStyle): string | null {
    switch (s) {
      case "apSports": return "AP Photo";
      case "gettySports":
      case "gettySportsParen": return "Getty Images";
      case "iconSports": return "Icon Sportswire via Getty Images";
      case "imagnImages": return "Imagn Images";
      default: return null;
    }
  },

  displayName(s: CaptionStyle): string {
    switch (s) {
      case "apSports": return "AP";
      case "hurrdatSports": return "Hurrdat Sports";
      case "gettySports": return "Getty";
      case "gettySportsParen": return "Getty — (2) instead of #2";
      case "imagnImages": return "Imagn";
      case "iconSports": return "Icon Sportswire";
      case "simple": return "Simple";
    }
  },
};

const AP_MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const WireDate = {
  text(date: Date, form: MonthForm): string {
    const names = form === "apAbbreviated" ? AP_MONTHS : form === "full" ? FULL_MONTHS : SHORT_MONTHS;
    return `${names[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  },
  weekday(date: Date): string { return WEEKDAYS[date.getDay()]; },
  datelineDate(date: Date): string { return `${FULL_MONTHS[date.getMonth()].toUpperCase()} ${date.getDate()}`; },
};
