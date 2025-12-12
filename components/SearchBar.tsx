import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';

interface SearchBarProps {
  onChange?: () => void;
}

export default function SearchBar({ onChange }: SearchBarProps) {
  const { facets, setFacets } = useStore();
  const [searchInput, setSearchInput] = useState(facets.searchQuery);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setFacets({ searchQuery: searchInput });
      onChange?.();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, setFacets, onChange]);

  // Focus search on / key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        document.getElementById('facet-search')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="px-4 py-3 border-b border-gray-200">
      <h2 className="text-lg font-bold text-gray-900 mb-3">Search</h2>
      <div className="relative">
        <input
          id="facet-search"
          type="text"
          placeholder="Search images... (press /)"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput('')}
            className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}


