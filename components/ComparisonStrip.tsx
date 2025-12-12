/**
 * ComparisonStrip Component - Side-by-side comparison of multiple sites
 * Shows small multiples grid for each selected site
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useStore, Image } from '../store/useStore';

interface ComparisonStripProps {
  siteIds: string[];
}

export default function ComparisonStrip({ siteIds }: ComparisonStripProps) {
  const router = useRouter();
  const { sites, setCurrentImageId } = useStore();
  const [siteImages, setSiteImages] = useState<Record<string, Image[]>>({});
  const [loading, setLoading] = useState(false);

  // Fetch images for all selected sites
  useEffect(() => {
    if (siteIds.length === 0) return;

    setLoading(true);
    
    Promise.all(
      siteIds.map(siteId =>
        fetch(`/api/sites/${siteId}/images?with_annotations=true`)
          .then(res => res.json())
          .then(data => ({ siteId, images: data.images || [] }))
      )
    )
      .then(results => {
        const imagesMap: Record<string, Image[]> = {};
        results.forEach(({ siteId, images }) => {
          imagesMap[siteId] = images.slice(0, 9); // Show first 9 images
        });
        setSiteImages(imagesMap);
      })
      .catch(err => {
        console.error('Error fetching comparison images:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [siteIds]);

  const handleImageClick = (imageId: string) => {
    setCurrentImageId(imageId);
    void router.push('/review');
  };

  if (siteIds.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border-b border-gray-200 shadow-sm">
      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">
          Comparing {siteIds.length} site{siteIds.length !== 1 ? 's' : ''}
        </h3>
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-4 p-4 min-w-max">
          {siteIds.map(siteId => {
            const site = sites.find(s => s.id === siteId);
            const images = siteImages[siteId] || [];

            return (
              <div key={siteId} className="flex-shrink-0 w-80">
                {/* Site header */}
                <div className="mb-2">
                  <div className="text-sm font-semibold text-gray-900">
                    {site?.name || siteId}
                  </div>
                  <div className="text-xs text-gray-600">
                    {site?.building_type && (
                      <span className="capitalize">{site.building_type}</span>
                    )}
                    {site?.period && site.period.length > 0 && (
                      <span className="ml-2">• {site.period.join(', ')}</span>
                    )}
                  </div>
                </div>

                {/* Image grid */}
                {loading && (
                  <div className="h-64 bg-gray-100 rounded flex items-center justify-center text-sm text-gray-500">
                    Loading...
                  </div>
                )}

                {!loading && images.length === 0 && (
                  <div className="h-64 bg-gray-100 rounded flex items-center justify-center text-sm text-gray-500">
                    No images
                  </div>
                )}

                {!loading && images.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {images.map((image, idx) => (
                      <div
                        key={image.id}
                        className="aspect-square bg-gray-100 rounded overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all relative group"
                        onClick={() => handleImageClick(image.id)}
                      >
                        <img
                          src={image.url}
                          alt={image.description || ''}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                          loading="lazy"
                        />
                        {image.annotation_count !== undefined && image.annotation_count > 0 && (
                          <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                            {image.annotation_count}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!loading && images.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500 text-center">
                    Showing {Math.min(images.length, 9)} of {site?.image_count || images.length} images
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

