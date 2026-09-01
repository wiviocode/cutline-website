export interface KeyChipProps {
  /** The key cap text, e.g. "⏎" or "e" */
  k: string;
  /** What the key does */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
