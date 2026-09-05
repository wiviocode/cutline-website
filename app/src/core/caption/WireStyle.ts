/**
 * How each desk writes the parts of a caption that are not the sentence about the play.
 *
 * Hurrdat's rules come from their own style guide. The rest come from a 2026 survey of published
 * guidance and live wire captions. Where the desk and a fixed set of example captions disagree,
 * the desk wins.
 */

import type { CaptionStyle } from "./CompositionContext";

export type MonthForm = "apAbbreviated" | "full" | "threeLetter";
export type StateForm = "apAbbreviation" | "fullName" | "postal";

const GETTY_LIKE = new Set<CaptionStyle>(["gettySports", "gettySportsParen", "iconSports"]);

export const WireStyle = {
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
  /** AP and Hurrdat set the date off with commas; Getty and Icon run it on with "on". */
  datesAreAppositive(s: CaptionStyle): boolean { return s === "apSports" || s === "hurrdatSports"; },
  /** AP names the day when the frame is recent; Hurrdat's guide shows it too. */
  includesWeekday(s: CaptionStyle): boolean { return WireStyle.datesAreAppositive(s); },
  /** Getty, Icon, Imagn and Hurrdat name the ground. AP usually leaves it out. */
  namesVenue(s: CaptionStyle): boolean { return s !== "apSports" && s !== "simple"; },
  /** Hurrdat puts the opponent ahead of the game clause, from the worked example in their guide. */
  opponentPrecedesGameClause(s: CaptionStyle): boolean { return s === "hurrdatSports"; },
  /** AP writes "an NCAA college football game" where the others write "a college football game". */
  levelQualifier(s: CaptionStyle, level: string): string {
    return s === "apSports" && level === "college" ? "NCAA college" : level;
  },
  /** Icon leads with "LINCOLN, NE - SEPTEMBER 14:" before the sentence. */
  hasDateline(s: CaptionStyle): boolean { return s === "iconSports"; },
  /** Imagn is not a sentence with a tail but a semicolon-delimited record. */
  isDelimitedRecord(s: CaptionStyle): boolean { return s === "imagnImages"; },

  /** Getty and Simple omit positions; Hurrdat's examples carry none either. */
  includesPosition(s: CaptionStyle): boolean {
    return !(GETTY_LIKE.has(s) || s === "simple" || s === "hurrdatSports");
  },
  /** Hurrdat writes the team singular ahead of a name: "Nebraska Cornhusker Adrian Martinez". */
  usesSingularTeamBeforeName(s: CaptionStyle): boolean { return s === "hurrdatSports"; },
  /** Getty writes `#5`; the paren variant and AP write `(5)`. */
  jerseyNumberIsParenthesised(s: CaptionStyle): boolean { return !(s === "gettySports" || s === "iconSports"); },
  /** Getty renders players as `Name #N of the Team`. Icon writes Getty's grammar, not AP's. */
  usesOfTheTeamForm(s: CaptionStyle): boolean { return GETTY_LIKE.has(s); },

  /**
   * The credit as it appears inside the caption, or null when the desk keeps it in the IPTC
   * fields. Nothing is emitted when no photographer is set, rather than a credit with an empty
   * name in it.
   */
  creditLine(s: CaptionStyle, photographer: string | null | undefined): string | null {
    const name = photographer?.trim();
    if (!name) return null;
    switch (s) {
      case "apSports":         return `(AP Photo/${name})`;
      case "gettySports":
      case "gettySportsParen": return `(Photo by ${name}/Getty Images)`;
      case "iconSports":       return `(Photo by ${name}/Icon Sportswire via Getty Images)`;
      case "imagnImages":      return `Mandatory Credit: ${name}-Imagn Images`;
      case "hurrdatSports":    return `Photo by ${name}.`;
      case "simple":           return null;
    }
  },

  /** The name a desk goes by, for the settings picker. */
  displayName(s: CaptionStyle): string {
    switch (s) {
      case "apSports":         return "AP";
      case "hurrdatSports":    return "Hurrdat Sports";
      case "gettySports":      return "Getty";
      case "gettySportsParen": return "Getty — (2) instead of #2";
      case "imagnImages":      return "Imagn";
      case "iconSports":       return "Icon Sportswire";
      case "simple":           return "Simple";
    }
  },
};

const AP_MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Writing a date the way a particular desk writes it. */
export const WireDate = {
  text(date: Date, form: MonthForm): string {
    const names = form === "apAbbreviated" ? AP_MONTHS : form === "full" ? FULL_MONTHS : SHORT_MONTHS;
    return `${names[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  },
  /** "SEPTEMBER 14", for Icon's uppercase dateline. */
  datelineDate(date: Date): string {
    return `${FULL_MONTHS[date.getMonth()].toUpperCase()} ${date.getDate()}`;
  },
};
