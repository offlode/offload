/**
 * Offload logo — stylized purple "O" mark with white inner counter.
 * Used in dashboard header, auth pages, and as PWA icon.
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
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Offload logo"
    >
      <rect width="48" height="48" rx="12" fill="#7C3AED" />
      <path
        d="M24 10C16.268 10 10 16.268 10 24C10 31.732 16.268 38 24 38C31.732 38 38 31.732 38 24C38 16.268 31.732 10 24 10ZM24 31C20.134 31 17 27.866 17 24C17 20.134 20.134 17 24 17C27.866 17 31 20.134 31 24C31 27.866 27.866 31 24 31Z"
        fill="white"
      />
    </svg>
  );
}

export function OffloadLogoMark({ size = 24, className }: OffloadLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Offload"
    >
      <path
        d="M24 4C12.954 4 4 12.954 4 24C4 35.046 12.954 44 24 44C35.046 44 44 35.046 44 24C44 12.954 35.046 4 24 4ZM24 34C18.477 34 14 29.523 14 24C14 18.477 18.477 14 24 14C29.523 14 34 18.477 34 24C34 29.523 29.523 34 24 34Z"
        fill="#7C3AED"
      />
    </svg>
  );
}
