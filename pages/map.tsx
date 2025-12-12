import React, { useCallback } from 'react';
import { useRouter } from 'next/router';
import MapView from '../components/MapView';
import ContextPane from '../components/ContextPane';
import { useStore } from '../store/useStore';
import { useSiteImageLoader } from '../hooks/useSiteImageLoader';

export default function MapPage() {
  const router = useRouter();
  const { selectedSiteIds } = useStore();
  const { handleSiteSelect, isLoading, error } = useSiteImageLoader();

  const onSiteSelect = useCallback(
    (siteId: string) => {
      handleSiteSelect(siteId);
      void router.push('/images');
    },
    [handleSiteSelect, router]
  );

  return (
    <div className="h-full flex flex-col bg-white min-h-0">
      {error && (
        <div className="px-4 py-2 text-sm bg-red-50 text-red-700 border-b border-red-200">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="px-4 py-2 text-xs bg-blue-50 text-blue-700 border-b border-blue-200">
          Loading images for selected site…
        </div>
      )}

      <div className="flex-1 relative min-h-0">
        <MapView onSiteSelect={onSiteSelect} />
      </div>

      <ContextPane siteId={selectedSiteIds[0] || null} onSiteSelect={onSiteSelect} />
    </div>
  );
}

