import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { ChevronRight } from 'lucide-react';
import { listRecentCaptures } from '@/src/storage/history';
import type { CaptureRecord } from '@/src/storage/db';
import { formatDateTime, t } from '@/src/shared/i18n';

const RECENT_COUNT = 8;

async function openCapture(captureId: string): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL(`/editor.html?captureId=${encodeURIComponent(captureId)}`) });
  window.close();
}

export function RecentGrid({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const [items, setItems] = useState<CaptureRecord[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listRecentCaptures(RECENT_COUNT)
      .then((results) => {
        if (!cancelled) setItems(results);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const thumbUrls = useMemo(() => (items ?? []).map((item) => URL.createObjectURL(item.blob)), [items]);
  useEffect(() => () => thumbUrls.forEach((url) => URL.revokeObjectURL(url)), [thumbUrls]);

  if (!items) return null;

  return (
    <section className="popup__recent" aria-labelledby="recent-title">
      <div className="popup__recent-header">
        <h2 id="recent-title" className="popup__recent-title">
          {t('recent')}
        </h2>
        {items.length > 0 && (
          <button type="button" className="popup__link" onClick={onOpenLibrary}>
            {t('viewAll')}
            <ChevronRight size={13} />
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="popup__empty">{t('recentEmpty')}</p>
      ) : (
        <div className="popup__recent-grid">
          {items.map((item, index) => {
            const label = `${item.sourceTitle || item.sourceUrl || t('untitledCapture')} · ${formatDateTime(item.createdAt)}`;
            return (
              <button
                key={item.captureId}
                type="button"
                className="popup__recent-thumb"
                title={label}
                aria-label={label}
                onClick={() => void openCapture(item.captureId)}
              >
                <img src={thumbUrls[index]} alt="" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
