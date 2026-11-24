import { serveCaptureBlobUrls } from '@/src/capture/quickActions';

// Offscreen document (no UI): turns stored captures into blob URLs for chrome.downloads,
// which a service worker cannot create. Opened only for a quick download, then closed.
serveCaptureBlobUrls();
