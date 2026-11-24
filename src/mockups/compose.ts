import type { DeviceGeometry } from '@/src/mockups/geometry';

/**
 * Draws the device frame (DeviceGeometry) with the screenshot in its
 * screen, on a transparent canvas. The screen area is exactly the
 * content's size, so the screenshot is drawn 1:1 - never cropped or scaled.
 * Background, padding and shadow are applied afterwards by
 * composeFramedObject, only when the user has chosen a background.
 */
export function drawDevice(content: HTMLCanvasElement, geometry: DeviceGeometry): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(geometry.width));
  canvas.height = Math.max(1, Math.round(geometry.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  const { body, screen, toolbar, camera, base } = geometry;

  if (base) {
    const gradient = ctx.createLinearGradient(0, base.y, 0, base.y + base.height);
    gradient.addColorStop(0, '#e4e4e9');
    gradient.addColorStop(1, '#a6a6ae');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(base.x, base.y, base.width, base.height, [0, 0, base.radius, base.radius]);
    ctx.fill();
    ctx.fillStyle = '#8d8d95';
    ctx.beginPath();
    ctx.roundRect(base.notch.x, base.notch.y, base.notch.width, base.notch.height, [
      0,
      0,
      base.notch.radius,
      base.notch.radius,
    ]);
    ctx.fill();
  }

  ctx.fillStyle = body.color;
  ctx.beginPath();
  ctx.roundRect(body.x, body.y, body.width, body.height, body.radius);
  ctx.fill();

  if (toolbar) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(body.x, body.y, body.width, body.height, body.radius);
    ctx.clip();
    ctx.fillStyle = toolbar.color;
    ctx.fillRect(body.x, body.y, body.width, toolbar.height);
    ctx.fillStyle = toolbar.divider;
    ctx.fillRect(body.x, body.y + toolbar.height - toolbar.dividerWidth, body.width, toolbar.dividerWidth);
    for (const dot of toolbar.dots) {
      ctx.fillStyle = dot.color;
      ctx.beginPath();
      ctx.arc(body.x + dot.cx, body.y + dot.cy, dot.r, 0, Math.PI * 2);
      ctx.fill();
    }
    const address = toolbar.address;
    ctx.fillStyle = address.color;
    ctx.beginPath();
    ctx.roundRect(body.x + address.x, body.y + address.y, address.width, address.height, address.radius);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(screen.x, screen.y, screen.width, screen.height, screen.radii);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(screen.x, screen.y, screen.width, screen.height);
  ctx.drawImage(content, screen.x, screen.y, screen.width, screen.height);
  ctx.restore();

  if (body.ringWidth > 0) {
    const inset = body.ringWidth / 2;
    ctx.strokeStyle = body.ring;
    ctx.lineWidth = body.ringWidth;
    ctx.beginPath();
    ctx.roundRect(
      body.x + inset,
      body.y + inset,
      body.width - body.ringWidth,
      body.height - body.ringWidth,
      Math.max(0, body.radius - inset),
    );
    ctx.stroke();
  }

  if (camera) {
    ctx.fillStyle = camera.color;
    ctx.beginPath();
    ctx.arc(camera.cx, camera.cy, camera.r, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}
