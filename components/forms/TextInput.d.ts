export interface TextInputProps {
  value?: string;
  onChange?: (e: any) => void;
  placeholder?: string;
  /** Mono face for numbers, filenames, tokens */
  mono?: boolean;
  autoFocus?: boolean;
  onKeyDown?: (e: any) => void;
  style?: React.CSSProperties;
}
