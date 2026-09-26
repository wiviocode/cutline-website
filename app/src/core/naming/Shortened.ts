/**
 * Fitting a name into a narrow column without throwing away the part that identifies it.
 *
 * Frames off one card differ only in their last few characters — `…_19.JPG` against `…_20.JPG`
 * — so cutting the end leaves a column of identical rows. The tail is given roughly two thirds
 * of the room for that reason.
 */
export const Shortened = {
  middle(text: string, limit: number): string {
    if (limit <= 0) return "";
    const chars = Array.from(text);
    if (chars.length <= limit) return text;
    const keep = limit - 1;                       // the ellipsis costs one
    const tail = Math.floor((keep * 2 + 2) / 3);   // two thirds, rounded up
    const head = keep - tail;
    return chars.slice(0, head).join("") + "…" + chars.slice(chars.length - tail).join("");
  },
};
