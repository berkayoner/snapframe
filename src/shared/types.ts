export type CaptureSourceType = 'visible' | 'full-page' | 'area' | 'element' | 'upload';

export type CaptureWarning =
  'truncated-max-height' | 'sticky-detection-best-effort' | 'cross-origin-frame-content-not-detectable';

export interface CaptureSource {
  url?: string;
  title?: string;
  type: CaptureSourceType;
}

/**
 * The handoff contract between a capture mode and the editor. Every capture
 * mode produces one of these regardless of how the pixels were obtained, so
 * the editor never needs to know which mode produced its input.
 */
export interface CapturePayload {
  captureId: string;
  createdAt: number;
  image: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  source: CaptureSource;
  warnings?: CaptureWarning[];
}

/**
 * Every object on the editor canvas shares this one model. Geometry is in
 * image pixels. `image` is the locked base screenshot; `shape` is a
 * rectangle (name kept for compatibility with autosaved projects); an
 * arrow's width/height is the vector from its start to its end point and
 * may be negative. Type-specific settings (colors, text content, step
 * number, ...) live in `style`. `magnify` is a loupe that enlarges the
 * screenshot under its center; `spotlight` dims everything outside its rect.
 */
export type EditorObjectType =
  'image' | 'text' | 'arrow' | 'shape' | 'ellipse' | 'step' | 'blur' | 'highlight' | 'magnify' | 'spotlight';

export interface EditorObject {
  id: string;
  type: EditorObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  zIndex?: number;
  style?: Record<string, unknown>;
}
