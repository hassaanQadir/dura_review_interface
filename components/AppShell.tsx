import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useStore } from '../store/useStore';

interface AppShellProps {
  children: ReactNode;
}

function NavItem({
  href,
  label,
  active
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block px-3 py-2 rounded text-sm font-medium ${
        active ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      {label}
    </Link>
  );
}

export default function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = router.pathname;

  const { sites, setSites, images, filteredImageIds, setFilteredImageIds, facets } = useStore();
  const [loadingSites, setLoadingSites] = useState(false);
  const [sitesError, setSitesError] = useState<string | null>(null);

  // Load initial sites (once, guarded)
  useEffect(() => {
    if (sites.length > 0) return;

    let cancelled = false;
    setLoadingSites(true);
    setSitesError(null);

    fetch('/api/sites?with_images=true')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.sites) setSites(data.sites);
      })
      .catch((err) => {
        console.error('Error loading sites:', err);
        if (cancelled) return;
        setSitesError('Failed to load sites. Please check your database connection.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingSites(false);
      });

    return () => {
      cancelled = true;
    };
  }, [setSites, sites.length]);

  // Apply filters whenever facets/images change (so navigation doesn’t stale filters)
  useEffect(() => {
    if (images.length === 0) {
      if (filteredImageIds.length !== 0) setFilteredImageIds([]);
      return;
    }

    let filtered = [...images];

    // Apply search filter
    if (facets.searchQuery.trim()) {
      const query = facets.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (img) =>
          (img.description || '').toLowerCase().includes(query) ||
          (img.filename || '').toLowerCase().includes(query) ||
          (img.depict_l2 || '').toLowerCase().includes(query) ||
          (img.keywords || []).some((k) => k.toLowerCase().includes(query))
      );
    }

    // Apply season filter
    if (facets.seasons.length > 0) {
      filtered = filtered.filter((img) => img.season && facets.seasons.includes(img.season));
    }

    // Apply has-annotations filter
    if (facets.hasAnnotations) {
      filtered = filtered.filter(
        (img) => img.annotation_count !== undefined && img.annotation_count > 0
      );
    }

    const ids = filtered.map((img) => img.id);
    // Avoid rerenders if unchanged
    if (ids.length === filteredImageIds.length && ids.every((id, i) => id === filteredImageIds[i])) {
      return;
    }
    setFilteredImageIds(ids);
  }, [facets, images, filteredImageIds, setFilteredImageIds]);

  const content = useMemo(() => {
    if (loadingSites && sites.length === 0) {
      return (
        <div className="flex items-center justify-center h-full bg-gray-50">
          <div className="text-center">
            <div className="text-xl font-semibold text-gray-900 mb-2">
              Loading Dura-Europos Data...
            </div>
            <div className="text-sm text-gray-600">
              Initializing spatial database and image collections
            </div>
          </div>
        </div>
      );
    }

    if (sitesError) {
      return (
        <div className="flex items-center justify-center h-full bg-gray-50">
          <div className="text-center max-w-md">
            <div className="text-xl font-semibold text-red-600 mb-2">Error Loading Data</div>
            <div className="text-sm text-gray-600 mb-4">{sitesError}</div>
            <div className="text-xs text-gray-500 bg-gray-100 p-3 rounded">
              <p className="mb-2">Make sure you have:</p>
              <ol className="text-left list-decimal list-inside space-y-1">
                <li>
                  Run the SQL setup:{' '}
                  <code className="bg-white px-1">sql/01_setup_postgis.sql</code>
                </li>
                <li>
                  Run the migration:{' '}
                  <code className="bg-white px-1">node scripts/migrate_data.js</code>
                </li>
                <li>
                  Set up environment variables in{' '}
                  <code className="bg-white px-1">.env.local</code>
                </li>
              </ol>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }, [children, loadingSites, sites.length, sitesError]);

  return (
    <>
      <Head>
        <title>Dura-Europos Spatial Research Interface</title>
        <meta
          name="description"
          content="Interactive spatial research interface for Dura-Europos archaeological data"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="h-screen w-screen overflow-hidden bg-gray-50 flex">
      <aside className="w-56 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200">
          <div className="text-sm font-semibold text-gray-900">Dura Review</div>
          <div className="text-xs text-gray-500 mt-1">Spatial research interface</div>
        </div>

        <nav className="p-3 space-y-1">
          <NavItem href="/map" label="Map" active={pathname === '/map'} />
          <NavItem href="/images" label="Images" active={pathname === '/images'} />
          <NavItem href="/review" label="Review" active={pathname === '/review'} />
        </nav>

        <div className="mt-auto px-4 py-3 border-t border-gray-200 text-xs text-gray-500">
          <div className="leading-5">
            Tip: pick a site → pick an image → review.
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 h-full">{content}</main>
      </div>

      {/* Global styles for MapLibre popups (previously in pages/index.tsx) */}
      <style jsx global>{`
        .maplibregl-popup-content {
          padding: 0;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        .maplibregl-popup-close-button {
          display: none;
        }
      `}</style>
    </>
  );
}

