import { ArrayBufferTarget as Mp4Target, Muxer as Mp4Muxer } from 'mp4-muxer';
import { ArrayBufferTarget as WebmTarget, Muxer as WebmMuxer } from 'webm-muxer';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { fitOutputSize, type AnimationScene } from '@/src/export/animate/scene';

export type AnimationFormat = 'mp4' | 'webm' | 'gif';

export const VIDEO_MAX_SIDE = 1920;
export const GIF_MAX_SIDE = 960;
const VIDEO_FPS = 30;
const GIF_FPS = 15;

export class EncodeCancelledError extends Error {}

/** H.264 level for the frame size (macroblocks), so encoders accept anything up to 4K-ish. */
function avcCodecs(width: number, height: number): string[] {
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  const level = macroblocks <= 3600 ? '1f' : macroblocks <= 8192 ? '28' : macroblocks <= 8704 ? '2a' : '32';
  return [`avc1.6400${level}`, `avc1.4d00${level}`, `avc1.4200${level}`];
}

function bitrateFor(width: number, height: number): number {
  return Math.round(Math.min(12_000_000, Math.max(2_000_000, width * height * VIDEO_FPS * 0.12)));
}

async function firstSupported(codecs: string[], width: number, height: number): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const codec of codecs) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: bitrateFor(width, height),
        framerate: VIDEO_FPS,
      });
      if (supported) return codec;
    } catch {
      // Try the next one.
    }
  }
  return null;
}

/** Which formats this browser can produce at the given size (MP4 needs a platform H.264 encoder). */
export async function supportedFormats(width: number, height: number): Promise<Record<AnimationFormat, boolean>> {
  const size = fitOutputSize(width, height, VIDEO_MAX_SIDE);
  const [mp4, webm] = await Promise.all([
    firstSupported(avcCodecs(size.width, size.height), size.width, size.height),
    firstSupported(['vp09.00.40.08', 'vp8'], size.width, size.height),
  ]);
  return { mp4: !!mp4, webm: !!webm, gif: true };
}

export interface EncodeOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new EncodeCancelledError();
}

async function encodeVideo(scene: AnimationScene, format: 'mp4' | 'webm', options: EncodeOptions): Promise<Blob> {
  const { width, height } = fitOutputSize(scene.width, scene.height, VIDEO_MAX_SIDE);
  const codec =
    format === 'mp4'
      ? await firstSupported(avcCodecs(width, height), width, height)
      : await firstSupported(['vp09.00.40.08', 'vp8'], width, height);
  if (!codec) throw new Error(`${format} encoding is not supported in this browser.`);

  const isVp9 = codec.startsWith('vp09');
  const muxer =
    format === 'mp4'
      ? new Mp4Muxer({ target: new Mp4Target(), video: { codec: 'avc', width, height }, fastStart: 'in-memory' })
      : new WebmMuxer({
          target: new WebmTarget(),
          video: { codec: isVp9 ? 'V_VP9' : 'V_VP8', width, height, frameRate: VIDEO_FPS },
        });

  let failure: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => {
      failure = error;
    },
  });
  encoder.configure({
    codec,
    width,
    height,
    bitrate: bitrateFor(width, height),
    framerate: VIDEO_FPS,
    ...(format === 'mp4' ? { avc: { format: 'avc' as const } } : {}),
  });

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  const frameCount = Math.max(1, Math.ceil(scene.timeline.duration * VIDEO_FPS));
  const frameDuration = Math.round(1_000_000 / VIDEO_FPS);
  try {
    for (let index = 0; index < frameCount; index++) {
      checkCancelled(options.signal);
      if (failure) throw failure;
      scene.renderFrame(index / VIDEO_FPS, ctx, width, height);
      const frame = new VideoFrame(canvas, { timestamp: index * frameDuration, duration: frameDuration });
      encoder.encode(frame, { keyFrame: index % (VIDEO_FPS * 2) === 0 });
      frame.close();
      options.onProgress?.((index + 1) / frameCount);
      // Back-pressure: let the encoder drain, and keep the UI responsive.
      while (encoder.encodeQueueSize > 8) await new Promise((resolve) => setTimeout(resolve, 4));
      if (index % 4 === 0) await nextTick();
    }
    await encoder.flush();
    if (failure) throw failure;
    muxer.finalize();
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  const buffer = muxer.target.buffer;
  return new Blob([buffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
}

async function encodeGif(scene: AnimationScene, options: EncodeOptions): Promise<Blob> {
  const { width, height } = fitOutputSize(scene.width, scene.height, GIF_MAX_SIDE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  // One palette for the whole clip, taken from the final frame (where every annotation is
  // visible) - per-frame palettes make flat UI colors shimmer.
  scene.renderFrame(scene.timeline.duration, ctx, width, height);
  const palette = quantize(ctx.getImageData(0, 0, width, height).data, 256);

  const gif = GIFEncoder();
  const frameCount = Math.max(1, Math.ceil(scene.timeline.duration * GIF_FPS));
  const delay = Math.round(1000 / GIF_FPS);
  for (let index = 0; index < frameCount; index++) {
    checkCancelled(options.signal);
    scene.renderFrame(index / GIF_FPS, ctx, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay, repeat: 0 });
    options.onProgress?.((index + 1) / frameCount);
    if (index % 2 === 0) await nextTick();
  }
  gif.finish();
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' });
}

/** Renders the scene's timeline into an MP4, WebM or GIF file - entirely on this device. */
export function encodeAnimation(scene: AnimationScene, format: AnimationFormat, options: EncodeOptions = {}) {
  return format === 'gif' ? encodeGif(scene, options) : encodeVideo(scene, format, options);
}
