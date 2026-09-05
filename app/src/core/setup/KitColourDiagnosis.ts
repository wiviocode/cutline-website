/**
 * Deciding whether a shoot's kit colours are actually wrong.
 *
 * Colour is the only thing that assigns a jersey to a team, so a side configured to what it
 * usually wears rather than what it wore names nobody — and the captions still read as correct
 * English, which is how it survives a whole shoot unnoticed.
 *
 * The hard part is not spotting it but not crying wolf. A couple of odd colour readings are
 * normal. A real misconfiguration takes most of one team with it. So the test is proportional as
 * well as absolute, and both halves have to hold.
 */
export const KitColourDiagnosis = {
  /** The smallest number of lost names worth interrupting for. */
  minimumLostNames: 4,
  /** The share of numbered jerseys that has to be affected. */
  minimumShare: 0.2,

  isMisconfigured(lostNames: number, readableJerseys: number): boolean {
    if (lostNames < KitColourDiagnosis.minimumLostNames || readableJerseys <= 0) return false;
    return lostNames / readableJerseys >= KitColourDiagnosis.minimumShare;
  },
};
