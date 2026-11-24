export type TextAlign = 'left' | 'center' | 'right';

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  /** A hex color, or 'transparent' for plain text without a label behind it. */
  backgroundColor: string;
  padding: number;
  cornerRadius: number;
  align: TextAlign;
}

export const FONT_FAMILIES = [
  { id: 'sans', value: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: 'serif', value: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', value: 'ui-monospace, "Cascadia Mono", Consolas, monospace' },
] as const;

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: FONT_FAMILIES[0].value,
  fontSize: 20,
  fontWeight: 600,
  color: '#ffffff',
  backgroundColor: '#ff3b30',
  padding: 8,
  cornerRadius: 6,
  align: 'left',
};

/** Text content lives alongside its style in EditorObject.style - there's no dedicated content field on EditorObject. */
export interface TextObjectData extends TextStyle {
  text: string;
}

export const DEFAULT_TEXT_DATA: TextObjectData = { ...DEFAULT_TEXT_STYLE, text: '' };

export function readTextData(style?: Record<string, unknown>): TextObjectData {
  return { ...DEFAULT_TEXT_DATA, ...(style as Partial<TextObjectData> | undefined) };
}

export function hasTextBackground(data: TextStyle): boolean {
  return data.backgroundColor !== 'transparent' && data.backgroundColor !== '';
}
