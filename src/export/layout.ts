import { isFrameActive, type BeautifySettings } from '@/src/editor/beautify/presets';
import { deviceGeometry, type CornerRadii } from '@/src/mockups/geometry';
import type { MockupConfig } from '@/src/mockups/registry';

/**
 * Size of the finished picture (device frame + background padding) for
 * content of the given size. `unit` converts source-page CSS px to the
 * content's pixels (capture DPR x export scale). Shared by the export, its
 * size estimate and the editor's fit-to-screen, so all three agree.
 */
export function framedSize(
  contentWidth: number,
  contentHeight: number,
  unit: number,
  beautify: BeautifySettings,
  mockup?: MockupConfig,
): { width: number; height: number } {
  let width = contentWidth;
  let height = contentHeight;
  if (mockup) {
    const geometry = deviceGeometry(mockup.type, contentWidth, contentHeight, unit);
    width = Math.round(geometry.width);
    height = Math.round(geometry.height);
  }
  if (isFrameActive(beautify)) {
    const padding = Math.round(beautify.padding * unit) * 2;
    width += padding;
    height += padding;
  }
  return { width, height };
}

export interface ContentPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The content's visible corner radii (rounded frame corners or the device screen). */
  radii: CornerRadii;
}

/**
 * Where content of the given size sits inside the finished picture, with
 * the same math as the export compositors - so animations can redraw just
 * the content area (annotations appearing, a page scrolling) inside an
 * otherwise fixed frame.
 */
export function contentPlacement(
  contentWidth: number,
  contentHeight: number,
  unit: number,
  beautify: BeautifySettings,
  mockup?: MockupConfig,
): ContentPlacement {
  const frameActive = isFrameActive(beautify);
  const padding = frameActive ? Math.round(beautify.padding * unit) : 0;
  if (mockup) {
    const geometry = deviceGeometry(mockup.type, contentWidth, contentHeight, unit);
    return {
      x: padding + geometry.screen.x,
      y: padding + geometry.screen.y,
      width: contentWidth,
      height: contentHeight,
      radii: geometry.screen.radii,
    };
  }
  const radius = frameActive ? Math.round(beautify.radius * unit) : 0;
  return {
    x: padding,
    y: padding,
    width: contentWidth,
    height: contentHeight,
    radii: [radius, radius, radius, radius],
  };
}
