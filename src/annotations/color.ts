/** Annotation palette - high-contrast colors that read well on typical UI screenshots. */
export const ANNOTATION_COLORS = [
  '#ff3b30', // red
  '#ff9500', // orange
  '#ffcc00', // yellow
  '#34c759', // green
  '#007aff', // blue
  '#af52de', // purple
  '#111111', // black
  '#ffffff', // white
];

/** Stroke presets, in source-page CSS pixels (scaled by the capture's pixel ratio when drawn). */
export const STROKE_WIDTHS = [2, 4, 6, 10];

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return null;
  let digits = match[1];
  if (digits.length === 3) {
    digits = digits
      .split('')
      .map((digit) => digit + digit)
      .join('');
  }
  const value = Number.parseInt(digits, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** Relative luminance check (WCAG formula) - used to pick black or white text on a colored label. */
export function isLightColor(hex: string): boolean {
  const rgb = parseHex(hex);
  if (!rgb) return false;
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

export function contrastTextColor(background: string): string {
  return isLightColor(background) ? '#111111' : '#ffffff';
}

export function isHexColor(value: string): boolean {
  return parseHex(value) !== null;
}
