export interface KitChipProps {
  /** Jersey number, or "?" when unread */
  number: string;
  /** Resolved player name, if the roster matched */
  name?: string;
  /** Kit colour swatch (CSS color) */
  colour?: string;
  /** Gold-washed when the model could not read the number */
  flagged?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}
