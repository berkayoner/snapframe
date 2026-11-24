import { useEffect, useState } from 'react';

/**
 * Loads a Blob into an HTMLImageElement for react-konva's <Image>, which
 * needs an actual CanvasImageSource rather than a URL string. Returns null
 * until the image for the *current* blob has decoded.
 */
export function useHtmlImage(blob: Blob | undefined): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ blob: Blob; image: HTMLImageElement } | null>(null);

  useEffect(() => {
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    let cancelled = false;

    image.onload = () => {
      if (!cancelled) setLoaded({ blob, image });
    };
    image.src = objectUrl;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  return loaded && loaded.blob === blob ? loaded.image : null;
}
