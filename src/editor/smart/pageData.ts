import type { SensitiveKind } from '@/src/capture/snapshot/sensitive';
import { snapshotBoxes, type PageSnapshot } from '@/src/capture/snapshot/types';
import type { Rect } from '@/src/editor/smart/snap';

export interface SensitiveRegion extends Rect {
  kind: SensitiveKind;
}

/**
 * The capture's page snapshot in *screenshot* pixels (CSS px x capture
 * pixel ratio), relative to the screenshot's own top-left. The editor adds
 * the base image's current offset when using them, so they stay aligned
 * after a crop.
 */
export interface PageData {
  boxes: Rect[];
  sensitive: SensitiveRegion[];
}

const scale = (rect: Rect, unit: number): Rect => ({
  x: rect.x * unit,
  y: rect.y * unit,
  width: rect.width * unit,
  height: rect.height * unit,
});

export function toPageData(snapshot: PageSnapshot | undefined, unit: number): PageData | null {
  if (!snapshot) return null;
  return {
    boxes: snapshotBoxes(snapshot).map((box) => scale(box, unit)),
    sensitive: snapshot.sensitive.map((region) => ({ kind: region.kind, ...scale(region, unit) })),
  };
}

/** Counts per kind, most frequent first - for "2 emails, 1 phone number". */
export function countByKind(regions: SensitiveRegion[]): Array<{ kind: SensitiveKind; count: number }> {
  const counts = new Map<SensitiveKind, number>();
  for (const region of regions) counts.set(region.kind, (counts.get(region.kind) ?? 0) + 1);
  return Array.from(counts, ([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count);
}
