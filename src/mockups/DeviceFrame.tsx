import type { CSSProperties, ReactNode } from 'react';
import type { CornerRadii, DeviceGeometry } from '@/src/mockups/geometry';

interface DeviceFrameProps {
  geometry: DeviceGeometry;
  /** Screen px per geometry px (the editor zoom). */
  scale: number;
  /** CSS filter for the frame's drop shadow, if the frame setting has one. */
  filter?: string;
  children: ReactNode;
}

function radii(values: CornerRadii, scale: number): string {
  return values.map((value) => `${value * scale}px`).join(' ');
}

/**
 * Live DOM version of the device frame around the editor canvas. Drawn
 * from the same DeviceGeometry as the export (compose.ts), so the editor
 * shows exactly what will be exported.
 */
export function DeviceFrame({ geometry: g, scale, filter, children }: DeviceFrameProps) {
  const s = (value: number) => value * scale;
  const { body, screen, toolbar, camera, base } = g;

  const bodyStyle: CSSProperties = {
    left: s(body.x),
    top: s(body.y),
    width: s(body.width),
    height: s(body.height),
    borderRadius: s(body.radius),
    background: body.color,
  };

  return (
    <div className="device" style={{ width: s(g.width), height: s(g.height), filter }}>
      {base && (
        <div
          className="device__base"
          style={{
            left: s(base.x),
            top: s(base.y),
            width: s(base.width),
            height: s(base.height),
            borderRadius: `0 0 ${s(base.radius)}px ${s(base.radius)}px`,
          }}
        >
          <span
            className="device__notch"
            style={{
              left: s(base.notch.x - base.x),
              width: s(base.notch.width),
              height: s(base.notch.height),
              borderRadius: `0 0 ${s(base.notch.radius)}px ${s(base.notch.radius)}px`,
            }}
          />
        </div>
      )}
      <div className="device__body" style={bodyStyle}>
        {toolbar && (
          <div
            className="device__toolbar"
            style={{
              height: s(toolbar.height),
              background: toolbar.color,
              boxShadow: `inset 0 -${s(toolbar.dividerWidth)}px 0 ${toolbar.divider}`,
            }}
          >
            {toolbar.dots.map((dot) => (
              <span
                key={dot.color}
                className="device__dot"
                style={{
                  left: s(dot.cx - dot.r),
                  top: s(dot.cy - dot.r),
                  width: s(dot.r * 2),
                  height: s(dot.r * 2),
                  background: dot.color,
                }}
              />
            ))}
            <span
              className="device__address"
              style={{
                left: s(toolbar.address.x),
                top: s(toolbar.address.y),
                width: s(toolbar.address.width),
                height: s(toolbar.address.height),
                borderRadius: s(toolbar.address.radius),
                background: toolbar.address.color,
              }}
            />
          </div>
        )}
      </div>
      <div
        className="device__screen"
        style={{
          left: s(screen.x),
          top: s(screen.y),
          width: s(screen.width),
          height: s(screen.height),
          borderRadius: radii(screen.radii, scale),
        }}
      >
        {children}
      </div>
      <span
        className="device__ring"
        style={{ ...bodyStyle, background: 'none', boxShadow: `inset 0 0 0 ${s(body.ringWidth)}px ${body.ring}` }}
      />
      {camera && (
        <span
          className="device__dot"
          style={{
            left: s(camera.cx - camera.r),
            top: s(camera.cy - camera.r),
            width: s(camera.r * 2),
            height: s(camera.r * 2),
            background: camera.color,
          }}
        />
      )}
    </div>
  );
}
