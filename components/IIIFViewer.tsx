/**
 * IIIFViewer Component - Simple IIIF image viewer with zoom/pan
 * Uses basic HTML/CSS for MVP, can be replaced with Mirador later
 */

import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import AnnotationEditor from './AnnotationEditor';

interface IIIFViewerProps {
  imageId: string;
}

export default function IIIFViewer({ imageId }: IIIFViewerProps) {
  const { images, setViewMode } = useStore();
  const [manifest, setManifest] = useState<any>(null);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showEditor, setShowEditor] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const image = images.find(img => img.id === imageId);

  // Fetch IIIF manifest and annotations
  useEffect(() => {
    if (!imageId) return;

    setLoading(true);

    Promise.all([
      fetch(`/api/iiif/${imageId}/manifest.json`).then(r => r.json()),
      fetch(`/api/annotations?image_id=${imageId}`).then(r => r.json())
    ])
      .then(([manifestData, annotData]) => {
        setManifest(manifestData);
        setAnnotations(annotData.annotations || []);
      })
      .catch(err => {
        console.error('Error loading IIIF data:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [imageId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showEditor) {
          setShowEditor(false);
        } else {
          setViewMode('gallery');
        }
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom(z => Math.min(z * 1.2, 5));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom(z => Math.max(z / 1.2, 1));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1);
        setPosition({ x: 0, y: 0 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setViewMode, showEditor]);

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(1, Math.min(z * delta, 5)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="text-gray-600">Loading image...</div>
      </div>
    );
  }

  if (!image) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="text-gray-600">Image not found</div>
      </div>
    );
  }

  const handleAnnotationSave = async () => {
    // Reload annotations after save
    const { data: annotData } = await fetch(`/api/annotations?image_id=${imageId}`)
      .then(r => r.json())
      .catch(() => ({ data: { annotations: [] } }));
    setAnnotations(annotData.annotations || []);
  };

  // Show annotation editor if enabled
  if (showEditor) {
    return (
      <AnnotationEditor
        imageUrl={image.url}
        imageId={imageId}
        existingAnnotations={annotations}
        onSave={handleAnnotationSave}
        onClose={() => setShowEditor(false)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 text-white">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setViewMode('gallery')}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            ← Back to Gallery
          </button>
          
          <div className="text-sm text-gray-300">
            {image.description || image.filename}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEditor(true)}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm font-semibold"
          >
            ✏️ Edit Annotations
          </button>

          <button
            onClick={() => setShowAnnotations(!showAnnotations)}
            className={`px-3 py-1 rounded text-sm ${
              showAnnotations ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            Annotations ({annotations.length})
          </button>

          <div className="flex items-center gap-1 bg-gray-700 rounded px-2">
            <button
              onClick={() => setZoom(z => Math.max(z / 1.2, 1))}
              className="px-2 py-1 hover:bg-gray-600 rounded text-lg"
            >
              −
            </button>
            <span className="px-2 text-sm">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(z * 1.2, 5))}
              className="px-2 py-1 hover:bg-gray-600 rounded text-lg"
            >
              +
            </button>
          </div>

          <button
            onClick={() => {
              setZoom(1);
              setPosition({ x: 0, y: 0 });
            }}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            Reset
          </button>

          <a
            href={image.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            Download
          </a>
        </div>
      </div>

      {/* Image viewer */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
            transition: isDragging ? 'none' : 'transform 0.1s ease-out'
          }}
        >
          <img
            ref={imageRef}
            src={image.url}
            alt={image.description || ''}
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        </div>
      </div>

      {/* Annotations list */}
      {showAnnotations && annotations.length > 0 && (
        <div className="absolute top-20 right-4 w-64 bg-white rounded-lg shadow-lg max-h-96 overflow-y-auto">
          <div className="p-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Annotations</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {annotations.map((annot) => (
              <div key={annot.id} className="p-3">
                <div className="text-sm font-medium text-gray-900">{annot.label}</div>
                {annot.note && (
                  <div className="text-xs text-gray-600 mt-1">{annot.note}</div>
                )}
                {annot.confidence && (
                  <div className="text-xs text-gray-500 mt-1">
                    Confidence: {annot.confidence}
                  </div>
                )}
                {annot.annotator && (
                  <div className="text-xs text-gray-400 mt-1">
                    By: {annot.annotator}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keyboard hints */}
      <div className="px-4 py-2 bg-gray-800 text-xs text-gray-400 flex gap-4">
        <span>Esc: Back to gallery</span>
        <span>+/−: Zoom</span>
        <span>0: Reset view</span>
        <span>Drag to pan</span>
      </div>
    </div>
  );
}

