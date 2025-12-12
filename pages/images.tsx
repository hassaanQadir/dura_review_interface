import React, { useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useStore } from '../store/useStore';
import ComparisonStrip from '../components/ComparisonStrip';
import Gallery from '../components/Gallery';
import IIIFViewer from '../components/IIIFViewer';
import SiteSchematic from '../components/SiteSchematic';

export default function ImagesPage() {
  const router = useRouter();
  const {
    viewMode,
    selectedSiteIds,
    currentImageId,
    images,
    filteredImageIds,
    setSelectedSites,
    setImages,
    setCurrentImageId
  } = useStore();

  const displayImages = useMemo(
    () => images.filter((img) => filteredImageIds.includes(img.id)),
    [filteredImageIds, images]
  );

  const onImageSelect = (imageId: string) => {
    setCurrentImageId(imageId);
    void router.push('/review');
  };

  // Global keyboard shortcuts relevant to the images view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      // Detail view Escape is handled by IIIFViewer
      if (viewMode === 'detail') return;

      // Clear selection and images
      e.preventDefault();
      setSelectedSites([]);
      setImages([]);
      setCurrentImageId(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setCurrentImageId, setImages, setSelectedSites, viewMode]);

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden min-h-0">
      {selectedSiteIds.length > 1 && (
        <div className="flex-shrink-0">
          <ComparisonStrip siteIds={selectedSiteIds} />
        </div>
      )}

      <div className="flex-1 overflow-hidden min-h-0">
        {viewMode === 'gallery' ? (
          selectedSiteIds.length > 0 ? (
            <SiteSchematic
              siteId={selectedSiteIds[0]}
              images={displayImages}
              onImageSelect={onImageSelect}
            />
          ) : (
            <Gallery images={displayImages} onImageSelect={onImageSelect} />
          )
        ) : currentImageId ? (
          <IIIFViewer imageId={currentImageId} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <p className="text-lg mb-2">No image selected</p>
              <p className="text-sm">Select an image from the gallery</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

