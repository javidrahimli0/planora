interface PlanoraLogoMarkProps {
  className?: string;
}

export default function PlanoraLogoMark({ className = 'h-9 w-9' }: PlanoraLogoMarkProps) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
      <line x1="8" y1="11" x2="32" y2="11" stroke="#4e66c6" strokeWidth="3.2" strokeLinecap="round" />
      <line x1="8" y1="20" x2="32" y2="20" stroke="#ef4444" strokeWidth="3.2" strokeLinecap="round" />
      <line x1="8" y1="29" x2="32" y2="29" stroke="#22c55e" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}