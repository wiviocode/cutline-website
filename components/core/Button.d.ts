/** @startingPoint section="Components" subtitle="Gold primary, control secondary, ghost" viewport="700x200" */
export interface ButtonProps {
  /** 'primary' (gold) | 'secondary' (app control) | 'ghost' */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** 'app' (26px chrome control) | 'marketing' (large site CTA) */
  size?: 'app' | 'marketing';
  disabled?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
