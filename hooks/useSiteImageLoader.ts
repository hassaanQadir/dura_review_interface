import { useCallback, useState } from 'react';
import { useStore } from '../store/useStore';

export function useSiteImageLoader() {
  const { setSelectedSites, setImages, setFilteredImageIds, setCurrentImageId, setViewMode } =
    useStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSiteImages = useCallback(
    async (siteId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/sites/${siteId}/images?with_annotations=true`);
        const data = await res.json();
        if (data?.images) {
          setImages(data.images);
          setFilteredImageIds(data.images.map((img: any) => img.id));
        } else {
          setImages([]);
          setFilteredImageIds([]);
        }
      } catch (e) {
        console.error('Error loading images:', e);
        setError('Failed to load images for site');
      } finally {
        setIsLoading(false);
      }
    },
    [setFilteredImageIds, setImages]
  );

  const handleSiteSelect = useCallback(
    (siteId: string) => {
      setSelectedSites([siteId]);
      setCurrentImageId(null);
      setViewMode('gallery');
      void loadSiteImages(siteId);
    },
    [loadSiteImages, setCurrentImageId, setSelectedSites, setViewMode]
  );

  return { handleSiteSelect, loadSiteImages, isLoading, error };
}

