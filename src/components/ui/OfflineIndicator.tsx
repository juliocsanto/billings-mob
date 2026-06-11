import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Sticky banner shown while the device is offline. The PWA keeps working
 * (offline-first); this only makes the state visible so the aluna knows her
 * entries will sync later.
 */
export function OfflineIndicator() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-indicator"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-warning-light px-4 py-2 text-sm font-semibold text-warning"
    >
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
      {t('ui.offline')}
    </div>
  );
}
