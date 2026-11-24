import type { SensitiveKind } from '@/src/capture/snapshot/sensitive';

export interface SnapshotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * What SnapFrame learned about the page at capture time, so the editor can
 * be "page-aware": element boxes (for magnetic drawing and one-click
 * framing) and the positions of sensitive data (for one-click redaction).
 * Coordinates are CSS px relative to the capture's top-left corner; the
 * editor multiplies them by the capture's pixel ratio. Stored locally with
 * the capture only - the sensitive text itself is never stored, just where
 * it was and what kind it was.
 */
export interface PageSnapshot {
  /** Element boxes, flattened as [x, y, width, height, x, y, ...]. */
  boxes: number[];
  sensitive: Array<SnapshotRect & { kind: SensitiveKind }>;
}

export interface SnapshotOptions {
  /** Region coordinates are document-relative (full-page) instead of viewport-relative. */
  documentCoords: boolean;
  /** Elements inside matches of this selector are left out (e.g. bars shown elsewhere in a full-page stitch). */
  skipSelector?: string;
}

export function isPageSnapshot(value: unknown): value is PageSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PageSnapshot>;
  return Array.isArray(candidate.boxes) && Array.isArray(candidate.sensitive);
}

export function snapshotBoxes(snapshot: PageSnapshot | undefined): SnapshotRect[] {
  if (!snapshot) return [];
  const boxes: SnapshotRect[] = [];
  for (let i = 0; i + 3 < snapshot.boxes.length; i += 4) {
    boxes.push({
      x: snapshot.boxes[i]!,
      y: snapshot.boxes[i + 1]!,
      width: snapshot.boxes[i + 2]!,
      height: snapshot.boxes[i + 3]!,
    });
  }
  return boxes;
}
