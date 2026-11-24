export type MockupDeviceType = 'browser' | 'laptop' | 'phone' | 'tablet';

/**
 * Available device frames. Frames are drawn procedurally around the
 * screenshot (see geometry.ts), so there are no image assets to keep in
 * sync. The ids are stored in autosaved projects - keep them stable.
 */
export interface MockupConfig {
  id: string;
  type: MockupDeviceType;
}

export const MOCKUPS: MockupConfig[] = [
  { id: 'browser-minimal', type: 'browser' },
  { id: 'laptop-generic', type: 'laptop' },
  { id: 'phone-generic', type: 'phone' },
  { id: 'tablet-generic', type: 'tablet' },
];

export function getMockupById(id: string | null): MockupConfig | undefined {
  return id ? MOCKUPS.find((mockup) => mockup.id === id) : undefined;
}
