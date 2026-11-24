import { useId, type ReactNode } from 'react';
import { Ban, Plus } from 'lucide-react';
import { t } from '@/src/shared/i18n';

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="inspector__section">
      <h2 className="inspector__title">{title}</h2>
      {children}
      {hint && <p className="inspector__hint">{hint}</p>}
    </section>
  );
}

export function Field({ label, children, value }: { label: string; children: ReactNode; value?: string }) {
  return (
    <div className="inspector__field">
      <div className="inspector__label">
        <span>{label}</span>
        {value !== undefined && <span className="inspector__value">{value}</span>}
      </div>
      {children}
    </div>
  );
}

interface SegmentedProps<T extends string | number> {
  label: string;
  value: T | undefined;
  options: Array<{ value: T; label: ReactNode; title?: string; disabled?: boolean }>;
  onChange: (value: T) => void;
}

export function Segmented<T extends string | number>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className="segmented__item"
          aria-pressed={option.value === value}
          title={option.title}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface ColorPaletteProps {
  label: string;
  colors: string[];
  value: string | undefined;
  onChange: (color: string) => void;
  allowNone?: boolean;
}

/** Preset swatches plus a native picker for any custom color. 'transparent' represents "none". */
export function ColorPalette({ label, colors, value, onChange, allowNone }: ColorPaletteProps) {
  const pickerId = useId();
  const normalized = value?.toLowerCase();
  const isCustom = !!normalized && normalized !== 'transparent' && !colors.includes(normalized);

  return (
    <div className="palette" role="group" aria-label={label}>
      {allowNone && (
        <button
          type="button"
          className="palette__swatch palette__swatch--none"
          aria-pressed={normalized === 'transparent'}
          aria-label={t('colorNone')}
          title={t('colorNone')}
          onClick={() => onChange('transparent')}
        >
          <Ban size={14} />
        </button>
      )}
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className="palette__swatch"
          style={{ background: color }}
          aria-pressed={normalized === color.toLowerCase()}
          aria-label={color}
          title={color}
          onClick={() => onChange(color)}
        />
      ))}
      <label
        className="palette__swatch palette__swatch--custom"
        data-active={isCustom}
        title={t('colorCustom')}
        htmlFor={pickerId}
        style={isCustom ? { background: value } : undefined}
      >
        {!isCustom && <Plus size={14} />}
        <input
          id={pickerId}
          type="color"
          className="sr-only"
          value={isCustom && value ? value : '#ff3b30'}
          onChange={(event) => onChange(event.target.value)}
          aria-label={t('colorCustom')}
        />
      </label>
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
  /** Called when the user grabs the slider with the pointer. */
  onStart?: () => void;
  /** Called when the user releases the slider - ends a coalesced undo step. */
  onCommit?: () => void;
}

export function Slider({ label, value, min, max, step = 1, format, onChange, onStart, onCommit }: SliderProps) {
  return (
    <Field label={label} value={format ? format(value) : String(value)}>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerDown={onStart}
        onPointerUp={onCommit}
        onPointerCancel={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
      />
    </Field>
  );
}
