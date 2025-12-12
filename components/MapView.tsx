/**
 * MapView Component - Interactive map with building polygons
 * Uses MapLibre GL for rendering PostGIS geometries
 */

import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useStore } from '../store/useStore';

interface MapViewProps {
  onSiteSelect?: (siteId: string) => void;
}

// Building type color mapping
const BUILDING_TYPE_COLORS: Record<string, string> = {
  temple: '#9333ea', // purple
  house: '#f97316', // orange
  military: '#ef4444', // red
  bath: '#3b82f6', // blue
  religious: '#8b5cf6', // violet
  agora: '#14b8a6', // teal
  unknown: '#6b7280', // gray
};

export default function MapView({ onSiteSelect }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const { sites, selectedSiteIds, hoveredSiteId, setMapReady, setHoveredSiteId } = useStore();

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Create map instance
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      },
      center: [40.7272, 34.7469], // Dura-Europos coordinates
      zoom: 15,
      attributionControl: { compact: true }
    });

    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      setMapLoaded(true);
      setMapReady(true);
      console.log('Map loaded successfully');
      // Ensure the map sizes correctly after initial render
      map.current && map.current.resize();
    });

    // Resize on window size changes
    const handleResize = () => {
      map.current && map.current.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [setMapReady]);

  // Add sites layer when data is available
  useEffect(() => {
    if (!map.current || !mapLoaded || !sites || sites.length === 0) return;

    const mapInstance = map.current;

    // Convert sites to GeoJSON
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: sites
        .filter(site => site.geometry)
        .map(site => ({
          type: 'Feature',
          id: site.id,
          geometry: site.geometry,
          properties: {
            id: site.id,
            name: site.name,
            building_type: site.building_type || 'unknown',
            image_count: site.image_count || 0,
            period: site.period?.join(', ') || ''
          }
        }))
    };

    // Add source if it doesn't exist
    if (!mapInstance.getSource('sites')) {
      mapInstance.addSource('sites', {
        type: 'geojson',
        data: geojson
      });

      // Add fill layer
      mapInstance.addLayer({
        id: 'sites-fill',
        type: 'fill',
        source: 'sites',
        paint: {
          'fill-color': [
            'match',
            ['get', 'building_type'],
            'temple', BUILDING_TYPE_COLORS.temple,
            'house', BUILDING_TYPE_COLORS.house,
            'military', BUILDING_TYPE_COLORS.military,
            'bath', BUILDING_TYPE_COLORS.bath,
            'religious', BUILDING_TYPE_COLORS.religious,
            'agora', BUILDING_TYPE_COLORS.agora,
            BUILDING_TYPE_COLORS.unknown
          ],
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['get', 'image_count'],
            0, 0.2,
            10, 0.5,
            50, 0.7
          ]
        }
      });

      // Add outline layer
      mapInstance.addLayer({
        id: 'sites-outline',
        type: 'line',
        source: 'sites',
        paint: {
          'line-color': '#000',
          'line-width': [
            'case',
            ['in', ['get', 'id'], ['literal', selectedSiteIds]],
            3,
            1
          ],
          'line-opacity': 0.8
        }
      });

      // Add labels
      mapInstance.addLayer({
        id: 'sites-labels',
        type: 'symbol',
        source: 'sites',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 0],
          'text-anchor': 'center'
        },
        paint: {
          'text-color': '#000',
          'text-halo-color': '#fff',
          'text-halo-width': 2
        }
      });

      // Click handler
      mapInstance.on('click', 'sites-fill', (e) => {
        if (e.features && e.features.length > 0) {
          const siteId = e.features[0].properties?.id;
          if (siteId && onSiteSelect) {
            onSiteSelect(siteId);
          }
        }
      });

      // Hover handlers
      mapInstance.on('mouseenter', 'sites-fill', (e) => {
        mapInstance.getCanvas().style.cursor = 'pointer';
        if (e.features && e.features.length > 0) {
          const siteId = e.features[0].properties?.id;
          if (siteId) {
            setHoveredSiteId(siteId);
          }
        }
      });

      mapInstance.on('mouseleave', 'sites-fill', () => {
        mapInstance.getCanvas().style.cursor = '';
        setHoveredSiteId(null);
      });

      // Add popup on hover
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 15
      });

      mapInstance.on('mouseenter', 'sites-fill', (e) => {
        if (e.features && e.features.length > 0) {
          const props = e.features[0].properties;
          const html = `
            <div class="p-2">
              <div class="font-bold text-sm">${props?.name || 'Unknown'}</div>
              <div class="text-xs text-gray-600">${props?.building_type || 'unknown'}</div>
              <div class="text-xs text-gray-500">${props?.image_count || 0} images</div>
            </div>
          `;
          popup.setLngLat(e.lngLat).setHTML(html).addTo(mapInstance);
        }
      });

      mapInstance.on('mouseleave', 'sites-fill', () => {
        popup.remove();
      });

    } else {
      // Update existing source
      const source = mapInstance.getSource('sites') as maplibregl.GeoJSONSource;
      source.setData(geojson);
    }
  }, [mapLoaded, sites, selectedSiteIds, onSiteSelect, setHoveredSiteId]);

  // Update outline when selection changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;
    if (mapInstance.getLayer('sites-outline')) {
      mapInstance.setPaintProperty('sites-outline', 'line-width', [
        'case',
        ['in', ['get', 'id'], ['literal', selectedSiteIds]],
        3,
        1
      ]);
    }
  }, [selectedSiteIds, mapLoaded]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0" />
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 text-xs">
        <div className="font-bold mb-2">Building Types</div>
        {Object.entries(BUILDING_TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-2 mb-1">
            <div 
              className="w-4 h-4 rounded border border-gray-300"
              style={{ backgroundColor: color }}
            />
            <span className="capitalize">{type}</span>
          </div>
        ))}
      </div>

      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="text-gray-600">Loading map...</div>
        </div>
      )}
    </div>
  );
}

