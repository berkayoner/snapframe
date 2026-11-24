import type { MockupDeviceType } from '@/src/mockups/registry';

export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Corner radii: top-left, top-right, bottom-right, bottom-left. */
export type CornerRadii = [number, number, number, number];

/**
 * Everything needed to draw a device frame around a screenshot - shared by
 * the live editor (DOM, see DeviceFrame.tsx) and the export (canvas, see
 * compose.ts), so both always match.
 *
 * The frame adapts to the screenshot instead of the other way round: the
 * screen area is exactly the content's size and aspect ratio, so nothing is
 * ever cropped or stretched. Phones and tablets turn to landscape for wide
 * screenshots.
 */
export interface DeviceGeometry {
  type: MockupDeviceType;
  orientation: 'portrait' | 'landscape';
  width: number;
  height: number;
  body: FrameRect & { radius: number; color: string; ring: string; ringWidth: number };
  screen: FrameRect & { radii: CornerRadii };
  toolbar?: {
    height: number;
    color: string;
    divider: string;
    dividerWidth: number;
    dots: Array<{ cx: number; cy: number; r: number; color: string }>;
    address: FrameRect & { radius: number; color: string };
  };
  camera?: { cx: number; cy: number; r: number; color: string };
  base?: FrameRect & { radius: number; notch: FrameRect & { radius: number } };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Frame geometry, in the same pixel space as `contentWidth`/`contentHeight`.
 * `unit` is pixels per source-page CSS pixel (capture DPR x export scale),
 * so bezels look equally thick on 1x and 2x captures and at any export
 * scale. Sizes are proportional to the screenshot's shorter side, within
 * sensible limits.
 */
export function deviceGeometry(
  type: MockupDeviceType,
  contentWidth: number,
  contentHeight: number,
  unit: number,
): DeviceGeometry {
  const u = Math.max(0.1, unit);
  const px = (css: number) => css * u;
  const shortSide = Math.min(contentWidth, contentHeight) / u;
  const orientation = contentHeight >= contentWidth ? 'portrait' : 'landscape';

  switch (type) {
    case 'browser': {
      const bar = px(clamp(shortSide * 0.055, 28, 40));
      const radius = px(10);
      const dotR = bar * 0.15;
      const addressHeight = bar * 0.58;
      const addressWidth = Math.min(contentWidth * 0.46, px(460));
      const height = contentHeight + bar;
      return {
        type,
        orientation,
        width: contentWidth,
        height,
        body: {
          x: 0,
          y: 0,
          width: contentWidth,
          height,
          radius,
          color: '#ffffff',
          ring: 'rgba(0, 0, 0, 0.12)',
          ringWidth: px(1),
        },
        screen: { x: 0, y: bar, width: contentWidth, height: contentHeight, radii: [0, 0, radius, radius] },
        toolbar: {
          height: bar,
          color: '#ececf1',
          divider: '#d6d6dd',
          dividerWidth: px(1),
          dots: ['#ff5f57', '#febc2e', '#28c840'].map((color, index) => ({
            cx: bar * 0.55 + index * dotR * 3.3,
            cy: bar / 2,
            r: dotR,
            color,
          })),
          address: {
            x: (contentWidth - addressWidth) / 2,
            y: (bar - addressHeight) / 2,
            width: addressWidth,
            height: addressHeight,
            radius: addressHeight / 2,
            color: '#ffffff',
          },
        },
      };
    }

    case 'laptop': {
      const bezel = px(clamp(shortSide * 0.03, 10, 24));
      const top = bezel * 1.4;
      const bodyWidth = contentWidth + bezel * 2;
      const bodyHeight = contentHeight + top + bezel;
      const overhang = bodyWidth * 0.07;
      const baseHeight = Math.max(px(10), bezel * 1.1);
      const notchWidth = bodyWidth * 0.16;
      const notchHeight = baseHeight * 0.38;
      const screenRadius = bezel * 0.25;
      return {
        type,
        orientation,
        width: bodyWidth + overhang * 2,
        height: bodyHeight + baseHeight,
        body: {
          x: overhang,
          y: 0,
          width: bodyWidth,
          height: bodyHeight,
          radius: bezel * 1.2,
          color: '#1c1c1f',
          ring: '#3a3a41',
          ringWidth: px(1.5),
        },
        screen: {
          x: overhang + bezel,
          y: top,
          width: contentWidth,
          height: contentHeight,
          radii: [screenRadius, screenRadius, screenRadius, screenRadius],
        },
        camera: { cx: overhang + bodyWidth / 2, cy: top / 2, r: Math.max(px(1.5), top * 0.1), color: '#3d3d45' },
        base: {
          x: 0,
          y: bodyHeight,
          width: bodyWidth + overhang * 2,
          height: baseHeight,
          radius: baseHeight * 0.55,
          notch: {
            x: overhang + (bodyWidth - notchWidth) / 2,
            y: bodyHeight,
            width: notchWidth,
            height: notchHeight,
            radius: notchHeight * 0.8,
          },
        },
      };
    }

    case 'phone':
    case 'tablet': {
      const isPhone = type === 'phone';
      const bezel = px(isPhone ? clamp(shortSide * 0.035, 8, 16) : clamp(shortSide * 0.045, 12, 28));
      const bodyWidth = contentWidth + bezel * 2;
      const bodyHeight = contentHeight + bezel * 2;
      const maxRadius = Math.min(bodyWidth, bodyHeight) / 2;
      const radius = Math.min(
        maxRadius,
        isPhone ? Math.max(bezel * 2, px(clamp(shortSide * 0.11, 26, 60))) : bezel * 1.7,
      );
      const screenRadius = Math.max(0, isPhone ? radius - bezel : bezel * 0.45);
      const cameraR = bezel * (isPhone ? 0.24 : 0.14);
      return {
        type,
        orientation,
        width: bodyWidth,
        height: bodyHeight,
        body: {
          x: 0,
          y: 0,
          width: bodyWidth,
          height: bodyHeight,
          radius,
          color: isPhone ? '#111113' : '#1a1a1d',
          ring: '#35353c',
          ringWidth: px(1.5),
        },
        screen: {
          x: bezel,
          y: bezel,
          width: contentWidth,
          height: contentHeight,
          radii: [screenRadius, screenRadius, screenRadius, screenRadius],
        },
        // The camera sits in the bezel on the device's short "top" edge.
        camera:
          orientation === 'portrait'
            ? { cx: bodyWidth / 2, cy: bezel / 2, r: cameraR, color: '#2e2e35' }
            : { cx: bezel / 2, cy: bodyHeight / 2, r: cameraR, color: '#2e2e35' },
      };
    }
  }
}
