export interface PillTabProps {
  /** Solid gold when true */
  active?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
