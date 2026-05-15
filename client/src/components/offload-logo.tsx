/**
 * Offload logo — brand mark from offload-mark.svg.
 * Circle with arc and center dot in brand purple #5B4BC4.
 */

interface OffloadLogoProps {
  size?: number;
  className?: string;
}

export function OffloadLogo({ size = 32, className }: OffloadLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Offload logo"
    >
      <circle cx="18" cy="18" r="16" stroke="#5B4BC4" strokeWidth="2.5" />
      <path
        d="M12 18c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6"
        stroke="#5B4BC4"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="18" cy="18" r="2" fill="#5B4BC4" />
    </svg>
  );
}

export function OffloadLogoMark({ size = 24, className }: OffloadLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Offload"
    >
      <circle cx="18" cy="18" r="16" stroke="#5B4BC4" strokeWidth="2.5" />
      <path
        d="M12 18c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6"
        stroke="#5B4BC4"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="18" cy="18" r="2" fill="#5B4BC4" />
    </svg>
  );
}
