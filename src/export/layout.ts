import { isFrameActive, type BeautifySettings } from '@/src/editor/beautify/presets';
import { deviceGeometry } from '@/src/mockups/geometry';
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
