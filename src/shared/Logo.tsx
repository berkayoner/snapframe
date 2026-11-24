import { useId } from 'react';

interface LogoMarkProps {
  size?: number;
  className?: string;
}

/**
 * The SnapFrame mark: two crop corners framing a spark, on the brand
 * gradient. Same artwork as branding/logo-mark.svg; below 24px it switches
 * to the pixel-tuned small master (branding/logo-mark-small.svg).
 */
export function LogoMark({ size = 24, className }: LogoMarkProps) {
  const id = useId();
  const tile = `${id}-tile`;
  const sheen = `${id}-sheen`;

  if (size < 24) {
    return (
      <svg className={className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={tile} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8F75FF" />
            <stop offset="1" stopColor="#5034E6" />
          </linearGradient>
        </defs>
        <rect width="16" height="16" rx="4" fill={`url(#${tile})`} />
        <path
          d="M3.75 8V5.5a1.75 1.75 0 0 1 1.75-1.75H8M12.25 8v2.5a1.75 1.75 0 0 1-1.75 1.75H8"
          fill="none"
          stroke="#fff"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path d="M10.5 3Q10.95 5.05 13 5.5Q10.95 5.95 10.5 8Q10.05 5.95 8 5.5Q10.05 5.05 10.5 3Z" fill="#FFD34E" />
      </svg>
    );
  }

  return (
    <svg className={className} width={size} height={size} viewBox="0 0 128 128" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8F75FF" />
          <stop offset="1" stopColor="#5034E6" />
        </linearGradient>
        <radialGradient id={sheen} cx="0.2" cy="0.1" r="0.95">
          <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="128" height="128" rx="30" fill={`url(#${tile})`} />
      <rect width="128" height="128" rx="30" fill={`url(#${sheen})`} />
      <rect
        x="0.75"
        y="0.75"
        width="126.5"
        height="126.5"
        rx="29.25"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.16"
        strokeWidth="1.5"
      />
      <path
        d="M33 64V45a12 12 0 0 1 12-12h19M95 64v19a12 12 0 0 1-12 12H64"
        fill="none"
        stroke="#fff"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path d="M82 29Q85.2 42.8 99 46Q85.2 49.2 82 63Q78.8 49.2 65 46Q78.8 42.8 82 29Z" fill="#FFD34E" />
    </svg>
  );
}

/** "SnapFrame" set in the brand face - two-tone, tight tracking (see branding/logo-wordmark.svg). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`wordmark${className ? ` ${className}` : ''}`}>
      <span className="wordmark__snap">Snap</span>
      <span className="wordmark__frame">Frame</span>
    </span>
  );
}

interface LogoProps {
  size?: number;
  className?: string;
}

/** Horizontal lockup: mark + wordmark. The wordmark scales with the mark. */
export function Logo({ size = 24, className }: LogoProps) {
  return (
    <span
      className={`logo${className ? ` ${className}` : ''}`}
      style={{ fontSize: size * 0.62, gap: size * 0.32 }}
      aria-label="SnapFrame"
      role="img"
    >
      <LogoMark size={size} />
      <Wordmark />
    </span>
  );
}
