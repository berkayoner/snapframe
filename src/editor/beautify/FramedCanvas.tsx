import type { CSSProperties, ReactNode } from 'react';
import { backgroundToCss, getShadowConfig, isFrameActive, type BeautifySettings } from '@/src/editor/beautify/presets';
import { DeviceFrame } from '@/src/mockups/DeviceFrame';
import { deviceGeometry } from '@/src/mockups/geometry';
import type { MockupConfig } from '@/src/mockups/registry';

interface FramedCanvasProps {
  settings: BeautifySettings;
  mockup?: MockupConfig;
  canvasWidth: number;
  canvasHeight: number;
  /** Image px per source-page CSS px. */
  unit: number;
  /** Screen px per image px. */
  zoom: number;
  children: ReactNode;
}

/**
 * Live version of the export around the editor canvas: the device frame
 * (if one is chosen) and the background/padding/radius/shadow (only once a
 * background is chosen). Sizes use the same units and the same geometry as
 * the export pipeline, so the editor shows exactly what gets exported.
 */
export function FramedCanvas({ settings, mockup, canvasWidth, canvasHeight, unit, zoom, children }: FramedCanvasProps) {
  const active = isFrameActive(settings);
  const scale = zoom * unit;
  const shadow = getShadowConfig(settings.shadow);
  const hasShadow = active && shadow.alpha > 0 && settings.padding > 0;

  const frameStyle: CSSProperties = active
    ? { background: backgroundToCss(settings.background), padding: settings.padding * scale }
    : {};

  let body: ReactNode;
  if (mockup) {
    // CSS drop-shadow's blur is a standard deviation; canvas shadowBlur is twice that.
    const filter = hasShadow
      ? `drop-shadow(0 ${shadow.offsetY * scale}px ${(shadow.blur * scale) / 2}px rgba(0, 0, 0, ${shadow.alpha}))`
      : undefined;
    body = (
      <DeviceFrame geometry={deviceGeometry(mockup.type, canvasWidth, canvasHeight, unit)} scale={zoom} filter={filter}>
        {children}
      </DeviceFrame>
    );
  } else {
    body = (
      <div
        className="beautify-frame__content"
        style={{
          borderRadius: active ? settings.radius * scale : 0,
          boxShadow: hasShadow
            ? `0 ${shadow.offsetY * scale}px ${shadow.blur * scale}px rgba(0, 0, 0, ${shadow.alpha})`
            : undefined,
        }}
      >
        {children}
      </div>
    );
  }

  const className = [
    'beautify-frame',
    !active && 'beautify-frame--plain',
    !active && mockup && 'beautify-frame--device',
    settings.background.type === 'transparent' && 'beautify-frame--transparent',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} style={frameStyle}>
      {body}
    </div>
  );
}
