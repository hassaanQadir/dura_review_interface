/**
 * ContextPane Component - Nearby sites and navigation
 * Shows breadcrumbs and spatially adjacent sites
 */

import React, { useEffect, useState } from 'react';
import { useStore, Site } from '../store/useStore';

interface ContextPaneProps {
  siteId?: string | null;
  onSiteSelect?: (siteId: string) => void;
}

export default function ContextPane({ siteId, onSiteSelect }: ContextPaneProps) {
  const { sites, nearbySites, setNearbySites, selectedSiteIds, toggleSite } = useStore();
  const [loading, setLoading] = useState(false);

  const currentSite = sites.find(s => s.id === siteId);

  // Fetch nearby sites
  useEffect(() => {
    if (!siteId) {
      setNearbySites([]);
      return;
    }

    setLoading(true);
    fetch(`/api/sites/${siteId}/nearby?limit=5`)
      .then(res => res.json())
      .then(data => {
        if (data.nearby_sites) {
          // Enrich with full site data
          const enrichedSites = data.nearby_sites
            .map((nearby: any) => {
              const fullSite = sites.find(s => s.id === nearby.id);
              return fullSite ? {
                ...fullSite,
                distance_m: nearby.distance_m,
                image_count: nearby.image_count
              } : null;
            })
            .filter(Boolean);
          setNearbySites(enrichedSites as Site[]);
        }
      })
      .catch(err => {
        console.error('Error fetching nearby sites:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [siteId, sites, setNearbySites]);

  // Keyboard navigation for nearby sites
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'N' && nearbySites.length > 0) {
        e.preventDefault();
        const nextSite = nearbySites[0];
        if (nextSite && onSiteSelect) {
          onSiteSelect(nextSite.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nearbySites, onSiteSelect]);

  if (!siteId || !currentSite) {
    return (
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
        <div className="text-sm text-gray-500 text-center">
          Select a site on the map to see nearby buildings
        </div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 max-h-64 overflow-y-auto">
      {/* Breadcrumb */}
      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
        <div className="text-xs text-gray-500">Current Site</div>
        <div className="text-sm font-semibold text-gray-900">{currentSite.name}</div>
        <div className="text-xs text-gray-600">
          {currentSite.building_type && (
            <span className="capitalize">{currentSite.building_type}</span>
          )}
          {currentSite.period && currentSite.period.length > 0 && (
            <span className="ml-2">• {currentSite.period.join(', ')}</span>
          )}
        </div>
      </div>

      {/* Nearby sites */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-700 uppercase">
            Nearby Sites
          </h3>
          <span className="text-xs text-gray-500">(press N for next)</span>
        </div>

        {loading && (
          <div className="text-sm text-gray-500 py-2">Loading nearby sites...</div>
        )}

        {!loading && nearbySites.length === 0 && (
          <div className="text-sm text-gray-500 py-2">
            No nearby sites found (geometry may be missing)
          </div>
        )}

        {!loading && nearbySites.length > 0 && (
          <div className="space-y-2">
            {nearbySites.map((site: any) => (
              <div
                key={site.id}
                className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedSiteIds.includes(site.id)
                    ? 'bg-blue-50 border-blue-300'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) {
                    // Multi-select
                    toggleSite(site.id);
                  } else {
                    // Single select
                    if (onSiteSelect) {
                      onSiteSelect(site.id);
                    }
                  }
                }}
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{site.name}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="capitalize">{site.building_type || 'unknown'}</span>
                    {site.distance_m !== undefined && (
                      <span>• {Math.round(site.distance_m)}m</span>
                    )}
                    <span>• {site.image_count || 0} images</span>
                  </div>
                </div>
                
                {selectedSiteIds.includes(site.id) && (
                  <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 text-xs text-gray-500">
          Tip: Cmd/Ctrl + click to select multiple sites for comparison
        </div>
      </div>
    </div>
  );
}

