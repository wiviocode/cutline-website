export interface SegmentedProps {
  /** Segment labels */
  options: string[];
  /** The active label */
  value?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}
