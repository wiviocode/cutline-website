export interface TextAreaProps {
  value?: string;
  onChange?: (e: any) => void;
  placeholder?: string;
  minHeight?: number;
  autoFocus?: boolean;
  onKeyDown?: (e: any) => void;
  style?: React.CSSProperties;
}
