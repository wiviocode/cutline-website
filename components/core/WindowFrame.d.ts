export interface WindowFrameProps {
  /** Mono text after the traffic lights */
  title?: string;
  /** Extra title-bar content */
  bar?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
