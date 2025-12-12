/**
 * AnnotationEditor Component
 * SVG-based annotation drawing tools extracted from public/index.html
 * Supports rectangle and ellipse drawing with labels
 */

import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import {
  createEllipseFromPoints,
  createRectFromPoints,
  deserializeGeometry,
  DragPoint,
  EllipseGeom,
  NormalizedShape,
  RectGeom,
  serializeShapeGeometry
} from '../utils/annotations/geometry';

interface Shape extends NormalizedShape {
  svgEl?: SVGElement;
  labelEl?: SVGTextElement;
}

interface AnnotationEditorProps {
  imageUrl: string;
  imageId: string;
  onSave?: (annotations: any[]) => void;
  onClose?: () => void;
  existingAnnotations?: any[];
  initialTool?: 'rect' | 'ellipse';
  initialColor?: string;
  onColorChange?: (color: string) => void;
}

export default function AnnotationEditor({
  imageUrl,
  imageId,
  onSave,
  onClose,
  existingAnnotations = [],
  initialTool = 'rect',
  initialColor = '#ef4444',
  onColorChange
}: AnnotationEditorProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [currentTool, setCurrentTool] = useState<'rect' | 'ellipse'>(initialTool);
  const [currentColor, setCurrentColor] = useState<string>(initialColor);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<DragPoint | null>(null);
  const [selectedShape, setSelectedShape] = useState<Shape | null>(null);
  const [labelCounter, setLabelCounter] = useState(1);
  const [dragState, setDragState] = useState<any>(null);
  const [annotationLabel, setAnnotationLabel] = useState('');
  const [annotationNote, setAnnotationNote] = useState('');
  const [annotationConfidence, setAnnotationConfidence] = useState<'low' | 'medium' | 'high'>('medium');

  const { setLastAnnotationLabel, lastAnnotationLabel } = useStore();

  // Load existing annotations
  useEffect(() => {
    if (existingAnnotations.length > 0) {
      const loadedShapes = existingAnnotations.map((annot, idx) =>
        ({
          ...deserializeGeometry(annot.geometry, annot.id || `shape_${idx}`, idx + 1)
        } as Shape)
      );
      setShapes(loadedShapes);
      setLabelCounter(loadedShapes.length + 1);
    }
  }, [existingAnnotations]);

  // React to external tool/color defaults
  useEffect(() => {
    setCurrentTool(initialTool);
  }, [initialTool]);

  useEffect(() => {
    setCurrentColor(initialColor);
  }, [initialColor]);

  // Redraw shapes when they change
  useEffect(() => {
    if (!overlayRef.current || !imageRef.current) return;
    redrawShapes();
  }, [shapes]);

  const getOverlayRect = () => {
    if (!overlayRef.current) return { width: 0, height: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };

  const getNormalizedPoint = (clientX: number, clientY: number): DragPoint | null => {
    if (!overlayRef.current) return null;
    const rect = overlayRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height
    };
  };

  const positionOverlay = () => {
    const img = imageRef.current;
    const overlay = overlayRef.current;
    if (!img || !overlay) return;

    const rect = img.getBoundingClientRect();
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.setAttribute('width', String(rect.width));
    overlay.setAttribute('height', String(rect.height));
  };

  useEffect(() => {
    positionOverlay();
    window.addEventListener('resize', positionOverlay);
    return () => window.removeEventListener('resize', positionOverlay);
  }, []);

  const redrawShapes = () => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    overlay.innerHTML = '';
    const r = getOverlayRect();

    shapes.forEach(shape => {
      if (shape.type === 'rect') {
        const geom = shape.geom as RectGeom;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(geom.x * r.width));
        rect.setAttribute('y', String(geom.y * r.height));
        rect.setAttribute('width', String(geom.w * r.width));
        rect.setAttribute('height', String(geom.h * r.height));
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', shape.color || '#ef4444');
        rect.setAttribute('stroke-width', selectedShape?.id === shape.id ? '3' : '2');
        if (selectedShape?.id === shape.id) {
          rect.setAttribute('opacity', '0.95');
        }
        rect.style.cursor = 'pointer';
        rect.addEventListener('click', () => handleShapeClick(shape));
        overlay.appendChild(rect);

        // Label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', String(geom.x * r.width + (geom.w * r.width) / 2));
        label.setAttribute('y', String(geom.y * r.height + (geom.h * r.height) / 2));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'middle');
        label.setAttribute('fill', shape.color || '#ef4444');
        label.setAttribute('font-size', '16');
        label.setAttribute('font-weight', 'bold');
        label.setAttribute('stroke', 'white');
        label.setAttribute('stroke-width', '3');
        label.setAttribute('paint-order', 'stroke');
        label.textContent = String(shape.label);
        label.style.cursor = 'pointer';
        label.addEventListener('click', () => handleShapeClick(shape));
        overlay.appendChild(label);

        shape.svgEl = rect;
        shape.labelEl = label;

      } else {
        const geom = shape.geom as EllipseGeom;
        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse.setAttribute('cx', String(geom.cx * r.width));
        ellipse.setAttribute('cy', String(geom.cy * r.height));
        ellipse.setAttribute('rx', String(geom.rx * r.width));
        ellipse.setAttribute('ry', String(geom.ry * r.height));
        ellipse.setAttribute('fill', 'none');
        ellipse.setAttribute('stroke', shape.color || '#ef4444');
        ellipse.setAttribute('stroke-width', selectedShape?.id === shape.id ? '3' : '2');
        if (selectedShape?.id === shape.id) {
          ellipse.setAttribute('opacity', '0.95');
        }
        ellipse.style.cursor = 'pointer';
        ellipse.addEventListener('click', () => handleShapeClick(shape));
        overlay.appendChild(ellipse);

        // Label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', String(geom.cx * r.width));
        label.setAttribute('y', String(geom.cy * r.height));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'middle');
        label.setAttribute('fill', shape.color || '#ef4444');
        label.setAttribute('font-size', '16');
        label.setAttribute('font-weight', 'bold');
        label.setAttribute('stroke', 'white');
        label.setAttribute('stroke-width', '3');
        label.setAttribute('paint-order', 'stroke');
        label.textContent = String(shape.label);
        label.style.cursor = 'pointer';
        label.addEventListener('click', () => handleShapeClick(shape));
        overlay.appendChild(label);

        shape.svgEl = ellipse;
        shape.labelEl = label;
      }
    });
  };

  const handleShapeClick = (shape: Shape) => {
    setSelectedShape(shape);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const point = getNormalizedPoint(e.clientX, e.clientY);
    if (!point) return;

    setIsDrawing(true);
    setDragStart(point);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !dragStart || !overlayRef.current) return;

    const current = getNormalizedPoint(e.clientX, e.clientY);
    if (!current) return;

    const overlay = overlayRef.current;
    const tempElements = overlay.querySelectorAll('.temp-shape');
    tempElements.forEach((el) => el.remove());

    const rect = overlay.getBoundingClientRect();
    const r = { width: rect.width, height: rect.height };

    if (currentTool === 'rect') {
      const geom = createRectFromPoints(dragStart, current, false);
      if (!geom) return;

      const tempRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      tempRect.classList.add('temp-shape');
      tempRect.setAttribute('x', String(geom.x * r.width));
      tempRect.setAttribute('y', String(geom.y * r.height));
      tempRect.setAttribute('width', String(geom.w * r.width));
      tempRect.setAttribute('height', String(geom.h * r.height));
      tempRect.setAttribute('fill', 'none');
      tempRect.setAttribute('stroke', '#3b82f6');
      tempRect.setAttribute('stroke-width', '2');
      tempRect.setAttribute('stroke-dasharray', '5,5');
      overlay.appendChild(tempRect);
    } else {
      const geom = createEllipseFromPoints(dragStart, current, false);
      if (!geom) return;

      const tempEllipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      tempEllipse.classList.add('temp-shape');
      tempEllipse.setAttribute('cx', String(geom.cx * r.width));
      tempEllipse.setAttribute('cy', String(geom.cy * r.height));
      tempEllipse.setAttribute('rx', String(geom.rx * r.width));
      tempEllipse.setAttribute('ry', String(geom.ry * r.height));
      tempEllipse.setAttribute('fill', 'none');
      tempEllipse.setAttribute('stroke', '#3b82f6');
      tempEllipse.setAttribute('stroke-width', '2');
      tempEllipse.setAttribute('stroke-dasharray', '5,5');
      overlay.appendChild(tempEllipse);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDrawing || !dragStart || !overlayRef.current) return;

    const current = getNormalizedPoint(e.clientX, e.clientY);
    const overlay = overlayRef.current;

    if (!current || !overlay) {
      setIsDrawing(false);
      setDragStart(null);
      return;
    }

    const tempElements = overlay.querySelectorAll('.temp-shape');
    tempElements.forEach((el) => el.remove());

    let geom: RectGeom | EllipseGeom | null = null;
    if (currentTool === 'rect') {
      geom = createRectFromPoints(dragStart, current, true);
    } else {
      geom = createEllipseFromPoints(dragStart, current, true);
    }

    if (!geom) {
      setIsDrawing(false);
      setDragStart(null);
      return;
    }

    const newShape: Shape = {
      id: `shape_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type: currentTool,
      geom,
      label: labelCounter,
      color: currentColor
    };

    setShapes((prev) => [...prev, newShape]);
    setLabelCounter((count) => count + 1);
    setSelectedShape(newShape);
    setIsDrawing(false);
    setDragStart(null);
  };

  const handleClear = () => {
    if (confirm('Clear all annotations?')) {
      setShapes([]);
      setLabelCounter(1);
      setSelectedShape(null);
    }
  };

  const handleDelete = () => {
    if (selectedShape) {
      setShapes(shapes.filter(s => s.id !== selectedShape.id));
      setSelectedShape(null);
    }
  };

  const handleSave = async () => {
    if (!selectedShape) {
      alert('Please select a shape and add a label');
      return;
    }

    if (!annotationLabel.trim()) {
      alert('Please enter a label for the annotation');
      return;
    }

    try {
      const annotation = {
        image_id: imageId,
        geometry: serializeShapeGeometry(selectedShape),
        label: annotationLabel,
        note: annotationNote,
        confidence: annotationConfidence,
        annotator: localStorage.getItem('annotator_name') || 'anonymous'
      };

      const response = await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(annotation)
      });

      if (!response.ok) {
        throw new Error('Failed to save annotation');
      }

      alert('Annotation saved successfully!');
      setLastAnnotationLabel(annotationLabel);
      setAnnotationLabel('');
      setAnnotationNote('');
      setSelectedShape(null);

      if (onSave) {
        const data = await response.json();
        onSave([data.annotation]);
      }
    } catch (error) {
      console.error('Error saving annotation:', error);
      alert('Failed to save annotation. Please try again.');
    }
  };

  const handleRepeatLast = () => {
    if (lastAnnotationLabel) {
      setAnnotationLabel(lastAnnotationLabel);
    }
  };

  const handleColorSelect = (color: string) => {
    setCurrentColor(color);
    onColorChange?.(color);
  };

  const palette = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7'];

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (e.key.toLowerCase() === 'f' && lastAnnotationLabel) {
        e.preventDefault();
        handleRepeatLast();
      } else if (e.key === 'Escape') {
        setSelectedShape(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedShape, lastAnnotationLabel]);

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 text-white">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentTool('rect')}
            className={`px-3 py-1 rounded text-sm ${
              currentTool === 'rect' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            Rectangle
          </button>
          <button
            onClick={() => setCurrentTool('ellipse')}
            className={`px-3 py-1 rounded text-sm ${
              currentTool === 'ellipse' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            Ellipse
          </button>
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs text-gray-300">Color</span>
            <div className="flex items-center gap-1">
              {palette.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorSelect(color)}
                  className={`w-6 h-6 rounded-full border-2 ${currentColor === color ? 'border-white' : 'border-transparent'} hover:scale-105 transition-transform`}
                  style={{ backgroundColor: color }}
                  aria-label={`Use color ${color}`}
                />
              ))}
            </div>
          </div>
          <button
            onClick={handleClear}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
          >
            Clear All
          </button>
          {selectedShape && (
            <button
              onClick={handleDelete}
              className="px-3 py-1 bg-orange-600 hover:bg-orange-700 rounded text-sm"
            >
              Delete Selected
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-300">{shapes.length} annotation{shapes.length !== 1 ? 's' : ''}</span>
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              Close Editor
            </button>
          )}
        </div>
      </div>

      {/* Image with overlay */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-auto bg-gray-950 flex items-center justify-center"
      >
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Annotation target"
          className="max-w-full max-h-full object-contain"
          onLoad={positionOverlay}
          draggable={false}
        />
        <svg
          ref={overlayRef}
          className="absolute pointer-events-auto"
          style={{ left: 0, top: 0 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />
      </div>

      {/* Annotation form */}
      {selectedShape && (
        <div className="bg-gray-800 text-white p-4 border-t border-gray-700">
          <h3 className="text-sm font-semibold mb-3">
            Annotating Shape #{selectedShape.label}
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-300 mb-1">Label *</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={annotationLabel}
                  onChange={(e) => setAnnotationLabel(e.target.value)}
                  placeholder="e.g., wall, column, doorway"
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm"
                />
                {lastAnnotationLabel && (
                  <button
                    onClick={handleRepeatLast}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                    title="Repeat last label (F key)"
                  >
                    F: "{lastAnnotationLabel}"
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-300 mb-1">Note</label>
              <textarea
                value={annotationNote}
                onChange={(e) => setAnnotationNote(e.target.value)}
                placeholder="Additional notes..."
                rows={2}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-300 mb-1">Confidence</label>
              <div className="flex gap-2">
                {(['low', 'medium', 'high'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setAnnotationConfidence(level)}
                    className={`px-3 py-1 rounded text-sm capitalize ${
                      annotationConfidence === level
                        ? 'bg-green-600'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleSave}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-semibold"
            >
              Save Annotation
            </button>
          </div>
        </div>
      )}

      {/* Keyboard hints */}
      <div className="px-4 py-2 bg-gray-800 text-xs text-gray-400 flex gap-4 border-t border-gray-700">
        <span>Draw: Click and drag</span>
        <span>Delete: Backspace/Delete</span>
        {lastAnnotationLabel && <span>F: Repeat last label</span>}
        <span>Esc: Deselect</span>
      </div>
    </div>
  );
}

