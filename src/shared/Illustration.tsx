import { useId } from 'react';

/**
 * Brand spot illustration (empty states): a screenshot card floating on the
 * brand gradient, framed by crop corners, with the spark. Built from the
 * same shapes as the logo so the product speaks one visual language.
 */
export function CapturesIllustration({ width = 160 }: { width?: number }) {
  const id = useId();
  const gradient = `${id}-g`;
  const height = width * 0.75;
  return (
    <svg width={width} height={height} viewBox="0 0 160 120" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8F75FF" />
          <stop offset="1" stopColor="#5034E6" />
        </linearGradient>
      </defs>
      {/* back card */}
      <rect
        x="40"
        y="14"
        width="92"
        height="66"
        rx="10"
        fill="var(--sf-iris-200)"
        opacity="0.55"
        transform="rotate(6 86 47)"
      />
      {/* framed gradient panel */}
      <rect x="22" y="22" width="104" height="76" rx="12" fill={`url(#${gradient})`} />
      {/* screenshot card */}
      <rect x="34" y="34" width="80" height="54" rx="7" fill="#fff" />
      <rect x="34" y="34" width="80" height="11" rx="7" fill="#EEEAFF" />
      <rect x="34" y="40" width="80" height="5" fill="#EEEAFF" />
      <circle cx="41" cy="39.5" r="1.8" fill="#C9BEFF" />
      <circle cx="47" cy="39.5" r="1.8" fill="#C9BEFF" />
      <rect x="41" y="52" width="38" height="5" rx="2.5" fill="#E4E4EC" />
      <rect x="41" y="61" width="58" height="4" rx="2" fill="#EDEDF3" />
      <rect x="41" y="69" width="46" height="4" rx="2" fill="#EDEDF3" />
      <rect x="88" y="50" width="18" height="14" rx="3" fill="none" stroke="#FF3B30" strokeWidth="2" />
      <circle cx="104" cy="76" r="5" fill="#FF3B30" />
      <text x="104" y="78.4" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff" fontFamily="var(--sf-font)">
        1
      </text>
      {/* crop corners */}
      <path
        d="M14 40V24a10 10 0 0 1 10-10h16M134 80v16a10 10 0 0 1-10 10h-16"
        fill="none"
        stroke="var(--sf-iris-500)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* spark */}
      <path d="M140 14Q141.6 21 148.5 22.5Q141.6 24 140 31Q138.4 24 131.5 22.5Q138.4 21 140 14Z" fill="#FFD34E" />
      <path d="M18 92Q18.8 95.4 22 96Q18.8 96.6 18 100Q17.2 96.6 14 96Q17.2 95.4 18 92Z" fill="#FFD34E" />
    </svg>
  );
}
