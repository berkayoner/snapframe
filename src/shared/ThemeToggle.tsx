import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/src/shared/theme';
import { t, type MessageKey } from '@/src/shared/i18n';

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

const LABEL: Record<ThemePreference, MessageKey> = {
  system: 'themeSystem',
  light: 'themeLight',
  dark: 'themeDark',
};

/** Cycles system -> light -> dark -> system. The choice persists (see src/shared/theme.ts). */
export function ThemeToggle({ tooltipSide = 'bottom' }: { tooltipSide?: 'bottom' | 'left' }) {
  const [theme, setTheme] = useTheme();
  const Icon = ICON[theme];
  const label = t('themeToggle', t(LABEL[theme]));

  return (
    <button
      type="button"
      className="icon-btn"
      data-tooltip={label}
      data-tooltip-side={tooltipSide}
      aria-label={label}
      onClick={() => setTheme(NEXT[theme])}
    >
      <Icon size={17} strokeWidth={1.9} />
    </button>
  );
}
