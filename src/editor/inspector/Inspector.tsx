import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AppWindow,
  ArrowDownToLine,
  ArrowUpToLine,
  Ban,
  Bold,
  CopyPlus,
  Laptop,
  Minus,
  MoveHorizontal,
  MoveRight,
  Smartphone,
  Tablet,
  Trash2,
  Magnet,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useEditorStore } from '@/src/editor/store/editorStore';
import { ANNOTATION_COLORS, STROKE_WIDTHS } from '@/src/annotations/color';
import { readObjectColor, supportsColor, supportsStrokeWidth } from '@/src/annotations/styleOps';
import { readArrowStyle, readShapeStyle, type ArrowHeads, type FillMode } from '@/src/annotations/shapes/shapeStyle';
import { FONT_FAMILIES, readTextData, type TextAlign, type TextObjectData } from '@/src/annotations/text/textStyle';
import { BLUR_STRENGTH_RANGE, readBlurStyle, type RedactMode } from '@/src/annotations/blur/blurStyle';
import { readStepStyle } from '@/src/annotations/step/stepStyle';
import { MAGNIFY_ZOOM_RANGE, readMagnifyStyle, type MagnifyShapeKind } from '@/src/annotations/magnify/magnifyStyle';
import {
  SPOTLIGHT_DIM_RANGE,
  readSpotlightStyle,
  type SpotlightShapeKind,
} from '@/src/annotations/spotlight/spotlightStyle';
import {
  BACKGROUND_PRESETS,
  PADDING_RANGE,
  RADIUS_RANGE,
  SHADOW_PRESETS,
  backgroundToCss,
  isFrameActive,
  isSameBackground,
  NO_BACKGROUND,
  type ShadowPreset,
} from '@/src/editor/beautify/presets';
import { MOCKUPS, type MockupDeviceType } from '@/src/mockups/registry';
import { ColorPalette, Field, Section, Segmented, Slider } from '@/src/editor/inspector/controls';
import { t, type MessageKey } from '@/src/shared/i18n';
import type { EditorObject, EditorObjectType } from '@/src/shared/types';
import { uncoveredSensitive } from '@/src/editor/smart/redact';
import { describeSensitive, runRedaction } from '@/src/editor/smart/SmartRedactBar';
import './Inspector.css';

const TYPE_LABEL: Record<EditorObjectType, MessageKey> = {
  image: 'objImage',
  shape: 'toolRectangle',
  ellipse: 'toolEllipse',
  arrow: 'toolArrow',
  text: 'toolText',
  step: 'toolStep',
  highlight: 'toolHighlight',
  blur: 'toolBlur',
  magnify: 'toolMagnify',
  spotlight: 'toolSpotlight',
};

const STROKE_LABELS = ['S', 'M', 'L', 'XL'];
const SHADOW_LABEL: Record<ShadowPreset, MessageKey> = {
  none: 'shadowNone',
  soft: 'shadowSoft',
  medium: 'shadowMedium',
  strong: 'shadowStrong',
};
const MOCKUP_ICON: Record<MockupDeviceType, typeof AppWindow> = {
  browser: AppWindow,
  laptop: Laptop,
  phone: Smartphone,
  tablet: Tablet,
};
const MOCKUP_LABEL: Record<MockupDeviceType, MessageKey> = {
  browser: 'mockupBrowser',
  laptop: 'mockupLaptop',
  phone: 'mockupPhone',
  tablet: 'mockupTablet',
};

function nearestStroke(widthCss: number): number {
  return STROKE_WIDTHS.reduce((best, candidate) =>
    Math.abs(candidate - widthCss) < Math.abs(best - widthCss) ? candidate : best,
  );
}

function StrokePicker({ value, onChange }: { value: number; onChange: (width: number) => void }) {
  return (
    <Field label={t('strokeWidth')}>
      <Segmented
        label={t('strokeWidth')}
        value={nearestStroke(value)}
        onChange={onChange}
        options={STROKE_WIDTHS.map((width, index) => ({
          value: width,
          title: `${width}px`,
          label: (
            <span className="stroke-sample" style={{ height: Math.min(8, Math.max(1.5, width * 0.7)) }}>
              <span className="sr-only">{STROKE_LABELS[index]}</span>
            </span>
          ),
        }))}
      />
    </Field>
  );
}

function TextControls({ object, unit }: { object: EditorObject; unit: number }) {
  const updateObjects = useEditorStore((state) => state.updateObjects);
  const endCoalesce = useEditorStore((state) => state.endCoalesce);
  const data = readTextData(object.style);

  function patch(partial: Partial<TextObjectData>, coalesce?: string) {
    updateObjects([{ id: object.id, patch: { style: { ...data, ...partial } } }], { coalesce });
  }

  const sizeCss = Math.round(data.fontSize / unit);

  return (
    <>
      <Field label={t('labelColor')}>
        <ColorPalette
          label={t('labelColor')}
          colors={ANNOTATION_COLORS}
          value={data.backgroundColor}
          allowNone
          onChange={(color) => patch({ backgroundColor: color })}
        />
      </Field>
      <Field label={t('textColor')}>
        <ColorPalette
          label={t('textColor')}
          colors={ANNOTATION_COLORS}
          value={data.color}
          onChange={(color) => patch({ color })}
        />
      </Field>
      <Slider
        label={t('fontSize')}
        value={sizeCss}
        min={10}
        max={96}
        format={(value) => `${value}px`}
        onChange={(value) => {
          const fontSize = Math.round(value * unit);
          patch(
            {
              fontSize,
              padding: Math.round(fontSize * 0.45),
              cornerRadius: Math.round(fontSize * 0.35),
            },
            `${object.id}:fontSize`,
          );
        }}
        onCommit={endCoalesce}
      />
      <div className="inspector__row">
        <select
          className="select inspector__grow"
          aria-label={t('fontFamily')}
          value={FONT_FAMILIES.find((font) => font.value === data.fontFamily)?.id ?? 'sans'}
          onChange={(event) =>
            patch({
              fontFamily: FONT_FAMILIES.find((font) => font.id === event.target.value)?.value ?? data.fontFamily,
            })
          }
        >
          {FONT_FAMILIES.map((font) => (
            <option key={font.id} value={font.id}>
              {t(font.id === 'sans' ? 'fontSans' : font.id === 'serif' ? 'fontSerif' : 'fontMono')}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-btn"
          aria-pressed={data.fontWeight >= 600}
          aria-label={t('bold')}
          data-tooltip={t('bold')}
          onClick={() => patch({ fontWeight: data.fontWeight >= 600 ? 400 : 700 })}
        >
          <Bold size={16} />
        </button>
      </div>
      <Segmented<TextAlign>
        label={t('textAlign')}
        value={data.align}
        onChange={(align) => patch({ align })}
        options={[
          { value: 'left', label: <AlignLeft size={15} />, title: t('alignLeft') },
          { value: 'center', label: <AlignCenter size={15} />, title: t('alignCenter') },
          { value: 'right', label: <AlignRight size={15} />, title: t('alignRight') },
        ]}
      />
    </>
  );
}

function SelectionPanel({ objects, unit }: { objects: EditorObject[]; unit: number }) {
  const applyColor = useEditorStore((state) => state.applyColor);
  const applyStrokeWidth = useEditorStore((state) => state.applyStrokeWidth);
  const updateObjects = useEditorStore((state) => state.updateObjects);
  const endCoalesce = useEditorStore((state) => state.endCoalesce);
  const bringToFront = useEditorStore((state) => state.bringToFront);
  const sendToBack = useEditorStore((state) => state.sendToBack);
  const duplicateSelection = useEditorStore((state) => state.duplicateSelection);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);

  const first = objects[0];
  if (!first) return null;
  const single = objects.length === 1;
  const allText = objects.every((object) => object.type === 'text');
  const colorable = objects.filter(supportsColor);
  const strokable = objects.filter(supportsStrokeWidth);
  const boxes = objects.filter((object) => object.type === 'shape' || object.type === 'ellipse');
  const arrows = objects.filter((object) => object.type === 'arrow');
  const firstArrow = arrows[0];
  const blurs = objects.filter((object) => object.type === 'blur');
  const lenses = objects.filter((object) => object.type === 'magnify');
  const spots = objects.filter((object) => object.type === 'spotlight');
  const firstStrokable = strokable[0];
  const firstBox = boxes[0];
  const firstBlur = blurs[0];
  const firstLens = lenses[0];
  const firstSpot = spots[0];

  const title = single ? t(TYPE_LABEL[first.type]) : t('selectionCount', objects.length);

  function patchEach(targets: EditorObject[], partial: Record<string, unknown>, coalesce?: string) {
    updateObjects(
      targets.map((object) => ({ id: object.id, patch: { style: { ...object.style, ...partial } } })),
      { coalesce },
    );
  }

  return (
    <Section title={title}>
      {single && first.type === 'text' ? (
        <TextControls object={first} unit={unit} />
      ) : (
        colorable.length > 0 &&
        !allText && (
          <Field label={t('color')}>
            <ColorPalette
              label={t('color')}
              colors={ANNOTATION_COLORS}
              value={readObjectColor(colorable[0] as EditorObject)}
              onChange={applyColor}
            />
          </Field>
        )
      )}

      {firstStrokable && (
        <StrokePicker
          value={(Number(firstStrokable.style?.strokeWidth) || 4 * unit) / unit}
          onChange={applyStrokeWidth}
        />
      )}

      {firstStrokable && strokable.length === objects.length && (
        <Field label={t('lineStyle')}>
          <Segmented<number>
            label={t('lineStyle')}
            value={firstStrokable.style?.dashed === true ? 1 : 0}
            onChange={(dashed) => patchEach(strokable, { dashed: dashed === 1 })}
            options={[
              { value: 0, label: <span className="line-sample" aria-hidden />, title: t('lineSolid') },
              {
                value: 1,
                label: <span className="line-sample line-sample--dashed" aria-hidden />,
                title: t('lineDashed'),
              },
            ]}
          />
        </Field>
      )}

      {firstArrow && arrows.length === objects.length && (
        <Field label={t('arrowHeads')}>
          <Segmented<ArrowHeads>
            label={t('arrowHeads')}
            value={readArrowStyle(firstArrow.style).heads}
            onChange={(heads) => patchEach(arrows, { heads })}
            options={[
              { value: 'end', label: <MoveRight size={16} />, title: t('arrowHeadEnd') },
              { value: 'both', label: <MoveHorizontal size={16} />, title: t('arrowHeadBoth') },
              { value: 'none', label: <Minus size={16} />, title: t('arrowHeadNone') },
            ]}
          />
        </Field>
      )}

      {firstBox && boxes.length === objects.length && (
        <Field label={t('fill')}>
          <Segmented<FillMode>
            label={t('fill')}
            value={readShapeStyle(firstBox.style).fillMode}
            onChange={(fillMode) => patchEach(boxes, { fillMode })}
            options={[
              { value: 'none', label: t('fillNone') },
              { value: 'tint', label: t('fillTint') },
              { value: 'solid', label: t('fillSolid') },
            ]}
          />
        </Field>
      )}

      {firstBox && single && first.type === 'shape' && (
        <Field label={t('corners')}>
          <Segmented<number>
            label={t('corners')}
            value={readShapeStyle(first.style).cornerRadius > 0 ? 1 : 0}
            onChange={(rounded) => patchEach([first], { cornerRadius: rounded ? Math.round(8 * unit) : 0 })}
            options={[
              { value: 0, label: t('cornersSharp') },
              { value: 1, label: t('cornersRounded') },
            ]}
          />
        </Field>
      )}

      {single && first.type === 'step' && (
        <Field label={t('stepNumber')}>
          <input
            type="number"
            className="input"
            min={0}
            max={999}
            value={readStepStyle(first.style).number}
            aria-label={t('stepNumber')}
            onChange={(event) => {
              const number = Math.max(0, Math.min(999, Math.round(Number(event.target.value) || 0)));
              patchEach([first], { number }, `${first.id}:number`);
            }}
            onBlur={endCoalesce}
          />
        </Field>
      )}

      {firstBlur && blurs.length === objects.length && (
        <>
          <Field label={t('redactMode')}>
            <Segmented<RedactMode>
              label={t('redactMode')}
              value={readBlurStyle(firstBlur.style).mode}
              onChange={(mode) => patchEach(blurs, { mode })}
              options={[
                { value: 'pixelate', label: t('redactPixelate') },
                { value: 'blur', label: t('redactBlur') },
              ]}
            />
          </Field>
          <Slider
            label={t('redactStrength')}
            value={Math.round(readBlurStyle(firstBlur.style).strength / unit)}
            min={BLUR_STRENGTH_RANGE.min}
            max={BLUR_STRENGTH_RANGE.max}
            onChange={(value) => patchEach(blurs, { strength: Math.round(value * unit) }, 'blur:strength')}
            onCommit={endCoalesce}
          />
        </>
      )}

      {firstLens && lenses.length === objects.length && (
        <>
          <Slider
            label={t('magnifyZoom')}
            value={readMagnifyStyle(firstLens.style).zoom}
            min={MAGNIFY_ZOOM_RANGE.min}
            max={MAGNIFY_ZOOM_RANGE.max}
            step={MAGNIFY_ZOOM_RANGE.step}
            format={(value) => `${value}×`}
            onChange={(zoom) => patchEach(lenses, { zoom }, 'magnify:zoom')}
            onCommit={endCoalesce}
          />
          <Field label={t('shapeTitle')}>
            <Segmented<MagnifyShapeKind>
              label={t('shapeTitle')}
              value={readMagnifyStyle(firstLens.style).shape}
              onChange={(shape) => patchEach(lenses, { shape })}
              options={[
                { value: 'circle', label: t('shapeCircle') },
                { value: 'rounded', label: t('shapeRounded') },
              ]}
            />
          </Field>
        </>
      )}

      {firstSpot && spots.length === objects.length && (
        <>
          <Slider
            label={t('spotlightDim')}
            value={Math.round(readSpotlightStyle(firstSpot.style).dim * 100)}
            min={SPOTLIGHT_DIM_RANGE.min}
            max={SPOTLIGHT_DIM_RANGE.max}
            step={SPOTLIGHT_DIM_RANGE.step}
            format={(value) => `${value}%`}
            // All spotlights share one dimming layer, so the setting applies to every one of them.
            onChange={(value) =>
              patchEach(
                useEditorStore.getState().objects.filter((object) => object.type === 'spotlight'),
                { dim: value / 100 },
                'spotlight:dim',
              )
            }
            onCommit={endCoalesce}
          />
          <Field label={t('shapeTitle')}>
            <Segmented<SpotlightShapeKind>
              label={t('shapeTitle')}
              value={readSpotlightStyle(firstSpot.style).shape}
              onChange={(shape) => patchEach(spots, { shape })}
              options={[
                { value: 'rect', label: t('shapeRect') },
                { value: 'rounded', label: t('shapeRounded') },
                { value: 'ellipse', label: t('shapeEllipse') },
              ]}
            />
          </Field>
        </>
      )}

      <div className="inspector__actions">
        <button
          type="button"
          className="icon-btn"
          aria-label={t('bringToFront')}
          data-tooltip={`${t('bringToFront')}   ]`}
          onClick={bringToFront}
        >
          <ArrowUpToLine size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t('sendToBack')}
          data-tooltip={`${t('sendToBack')}   [`}
          onClick={sendToBack}
        >
          <ArrowDownToLine size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t('duplicate')}
          data-tooltip={t('duplicate')}
          onClick={duplicateSelection}
        >
          <CopyPlus size={16} />
        </button>
        <span className="inspector__grow" />
        <button
          type="button"
          className="icon-btn inspector__danger"
          aria-label={t('delete')}
          data-tooltip={t('delete')}
          data-tooltip-side="left"
          onClick={deleteSelection}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </Section>
  );
}

function StyleDefaultsPanel() {
  const annotationColor = useEditorStore((state) => state.annotationColor);
  const strokeWidth = useEditorStore((state) => state.strokeWidth);
  const setAnnotationColor = useEditorStore((state) => state.setAnnotationColor);
  const setStrokeWidth = useEditorStore((state) => state.setStrokeWidth);
  const pageData = useEditorStore((state) => state.pageData);
  const snapEnabled = useEditorStore((state) => state.snapEnabled);
  const setSnapEnabled = useEditorStore((state) => state.setSnapEnabled);

  return (
    <Section title={t('styleTitle')} hint={t('styleHint')}>
      <Field label={t('color')}>
        <ColorPalette
          label={t('color')}
          colors={ANNOTATION_COLORS}
          value={annotationColor}
          onChange={setAnnotationColor}
        />
      </Field>
      <StrokePicker value={strokeWidth} onChange={setStrokeWidth} />
      {pageData && pageData.boxes.length > 0 && (
        <label className="switch-row">
          <span className="switch-row__text">
            <span className="switch-row__title">
              <Magnet size={14} />
              {t('magneticTitle')}
            </span>
            <span className="switch-row__hint">{t('magneticHint')}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={snapEnabled}
            onChange={(event) => setSnapEnabled(event.target.checked)}
          />
        </label>
      )}
    </Section>
  );
}

/** Detected personal data: one-click redaction, or confirmation that everything is covered. */
function PrivacyPanel() {
  useEditorStore((state) => state.objects);
  const pageData = useEditorStore((state) => state.pageData);
  if (!pageData || pageData.sensitive.length === 0) return null;
  const remaining = uncoveredSensitive();

  return (
    <Section title={t('privacyTitle')}>
      {remaining.length > 0 ? (
        <>
          <p className="privacy-summary">
            <ShieldAlert size={15} />
            <span>
              <strong>{t('redactFound', remaining.length)}</strong>
              <br />
              {describeSensitive(remaining)}
            </span>
          </p>
          <button type="button" className="btn btn--sm btn--primary" onClick={runRedaction}>
            {t('redactAll')}
          </button>
        </>
      ) : (
        <p className="privacy-summary privacy-summary--ok">
          <ShieldCheck size={15} />
          <span>{t('privacyAllCovered')}</span>
        </p>
      )}
    </Section>
  );
}

function FramePanel() {
  const beautify = useEditorStore((state) => state.beautify);
  const setBeautify = useEditorStore((state) => state.setBeautify);
  const mockupId = useEditorStore((state) => state.mockupId);
  const setFitLocked = useEditorStore((state) => state.setFitLocked);
  const active = isFrameActive(beautify);
  const customColor =
    beautify.background.type === 'solid' &&
    !BACKGROUND_PRESETS.some((preset) => isSameBackground(preset.background, beautify.background))
      ? beautify.background.color
      : undefined;

  // Hold the editor zoom steady while a slider is dragged; re-fit once on release.
  const lockFit = () => setFitLocked(true);
  const unlockFit = () => setFitLocked(false);

  return (
    <Section title={t('frameTitle')} hint={active ? undefined : t('frameHint')}>
      <div className="bg-swatches" role="group" aria-label={t('frameBackground')}>
        <button
          type="button"
          className="bg-swatch bg-swatch--none"
          aria-pressed={!active}
          aria-label={t('frameNone')}
          title={t('frameNone')}
          onClick={() => setBeautify({ background: NO_BACKGROUND })}
        >
          <Ban size={15} />
        </button>
        {BACKGROUND_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`bg-swatch${preset.background.type === 'transparent' ? ' bg-swatch--transparent' : ''}`}
            style={{ background: backgroundToCss(preset.background) }}
            aria-pressed={isSameBackground(preset.background, beautify.background)}
            aria-label={t(preset.label)}
            title={t(preset.label)}
            onClick={() => setBeautify({ background: preset.background })}
          />
        ))}
        <label
          className="bg-swatch bg-swatch--custom"
          data-active={!!customColor}
          title={t('colorCustom')}
          style={customColor ? { background: customColor } : undefined}
        >
          <input
            type="color"
            className="sr-only"
            value={customColor ?? '#6640f5'}
            aria-label={t('colorCustom')}
            onChange={(event) => setBeautify({ background: { type: 'solid', color: event.target.value } })}
          />
        </label>
      </div>
      {active && (
        <>
          <Slider
            label={t('framePadding')}
            value={beautify.padding}
            min={PADDING_RANGE.min}
            max={PADDING_RANGE.max}
            step={PADDING_RANGE.step}
            format={(value) => `${value}px`}
            onChange={(padding) => setBeautify({ padding })}
            onStart={lockFit}
            onCommit={unlockFit}
          />
          {!mockupId && (
            <Slider
              label={t('frameRadius')}
              value={beautify.radius}
              min={RADIUS_RANGE.min}
              max={RADIUS_RANGE.max}
              step={RADIUS_RANGE.step}
              format={(value) => `${value}px`}
              onChange={(radius) => setBeautify({ radius })}
            />
          )}
          <Field label={t('frameShadow')}>
            <Segmented<ShadowPreset>
              label={t('frameShadow')}
              value={beautify.shadow}
              onChange={(shadow) => setBeautify({ shadow })}
              options={SHADOW_PRESETS.map((shadow) => ({ value: shadow, label: t(SHADOW_LABEL[shadow]) }))}
            />
          </Field>
        </>
      )}
    </Section>
  );
}

function MockupPanel() {
  const mockupId = useEditorStore((state) => state.mockupId);
  const setMockupId = useEditorStore((state) => state.setMockupId);

  return (
    <Section title={t('mockupTitle')}>
      <div className="mockup-grid" role="group" aria-label={t('mockupTitle')}>
        <button
          type="button"
          className="mockup-tile"
          aria-pressed={mockupId === null}
          onClick={() => setMockupId(null)}
        >
          <Ban size={18} strokeWidth={1.7} />
          <span>{t('mockupNone')}</span>
        </button>
        {MOCKUPS.map((mockup) => {
          const Icon = MOCKUP_ICON[mockup.type];
          return (
            <button
              key={mockup.id}
              type="button"
              className="mockup-tile"
              aria-pressed={mockupId === mockup.id}
              onClick={() => setMockupId(mockup.id)}
            >
              <Icon size={18} strokeWidth={1.7} />
              <span>{t(MOCKUP_LABEL[mockup.type])}</span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

/** Right-hand panel: the selection's properties (or defaults for new annotations), then frame and mockup. */
export function Inspector() {
  const objects = useEditorStore((state) => state.objects);
  const selectedIds = useEditorStore((state) => state.selectedIds);
  const unit = useEditorStore((state) => state.unit);
  const selected = objects.filter((object) => selectedIds.includes(object.id));

  return (
    <aside className="inspector" aria-label={t('inspectorLabel')}>
      {selected.length > 0 ? <SelectionPanel objects={selected} unit={unit} /> : <StyleDefaultsPanel />}
      <PrivacyPanel />
      <FramePanel />
      <MockupPanel />
    </aside>
  );
}
