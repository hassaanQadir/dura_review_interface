import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, useStore } from '../store/useStore';
import {
  createEllipseFromPoints,
  createRectFromPoints,
  clamp01,
  deserializeGeometry,
  DragPoint,
  EllipseGeom,
  NormalizedShape,
  PathGeom,
  PathPoint,
  RectGeom
} from '../utils/annotations/geometry';

type ScopeChoice = 'field_current' | 'object_current' | 'field_other' | 'object_other';

type Cardinal = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
type Relation = 'to' | 'of' | 'from' | 'inside';
type Confidence = 'low' | 'medium' | 'high';

interface DirectionRow {
  label: number;
  cardinal: Cardinal;
  relation: Relation;
  location: string;
  confidence: Confidence;
}

interface AlsoRow {
  label: string;
  image: string;
}

interface ReviewRecord {
  image_scope?: { choice: ScopeChoice; location?: string; object?: string };
  relative?: DirectionRow[];
  also?: AlsoRow[];
  areas?: any[];
  comment?: string;
}

const CARDINALS: Cardinal[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const RELATIONS: Relation[] = ['to', 'of', 'from', 'inside'];
const CONFIDENCE: Confidence[] = ['low', 'medium', 'high'];
const SHEET_PROXY =
  'https://script.google.com/macros/s/AKfycbyHmER1r8qiNUN0iI0LtixMJ1KXFmQzO2opNjw5fswMLfL-WqXGGyTFtzLuiPXU-oOG/exec';

// Build minimal payload compatible with the static workflow
function buildPayload(
  image: Image,
  annotator: string,
  scope: ReviewRecord['image_scope'],
  relative: DirectionRow[],
  also: AlsoRow[],
  comment: string,
  areas: any[],
  status: 'draft' | 'final'
) {
  return {
    timestamp: new Date().toISOString(),
    status,
    user: annotator || '',
    image: image.filename || '',
    object_id: image.id || '',
    title: image.description || image.filename || '',
    location_key: image.site_id || '',
    image_scope: JSON.stringify(scope || { choice: 'field_current' }),
    relative: JSON.stringify(relative || []),
    also: JSON.stringify(also || []),
    comment: comment || '',
    depict_l1: image.depict_l1 || '',
    depict_l2: image.depict_l2 || '',
    areas: JSON.stringify(areas || []),
    upsert: '1'
  };
}

function normalizePoint(container: DOMRect, evt: MouseEvent): DragPoint {
  return {
    x: clamp01((evt.clientX - container.left) / container.width),
    y: clamp01((evt.clientY - container.top) / container.height)
  };
}

function shapeToArea(s: NormalizedShape, confidence?: Confidence) {
  if (s.type === 'rect') {
    const g = s.geom as RectGeom;
    return { type: 'rect', ...g, label: s.label, color: s.color, confidence };
  }
  if (s.type === 'ellipse') {
    const g = s.geom as EllipseGeom;
    return { type: 'ellipse', ...g, label: s.label, color: s.color, confidence };
  }
  const g = s.geom as PathGeom;
  return { type: 'path', points: g.points || [], label: s.label, color: s.color, confidence };
}

export default function ReviewAnnotator() {
  const {
    currentImageId,
    images
  } = useStore();

  const image = useMemo(() => (currentImageId ? images.find((i) => i.id === currentImageId) || null : null), [
    currentImageId,
    images
  ]);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [annotatorName, setAnnotatorName] = useState('');
  const [scopeChoice, setScopeChoice] = useState<ScopeChoice>('field_current');
  const [scopeLocation, setScopeLocation] = useState('');
  const [scopeObject, setScopeObject] = useState('');
  const [shapes, setShapes] = useState<NormalizedShape[]>([]);
  const [dragStart, setDragStart] = useState<DragPoint | null>(null);
  const [currentTool, setCurrentTool] = useState<'rect' | 'ellipse' | 'path'>('rect');
  const [currentColor, setCurrentColor] = useState<string>('#ef4444');
  const [comment, setComment] = useState('');
  const [also, setAlso] = useState<AlsoRow[]>([{ label: '', image: '' }]);
  const [relative, setRelative] = useState<Record<string, DirectionRow>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Freehand drawing state (refs to avoid rerender per point)
  const pathPointsRef = useRef<PathPoint[]>([]);
  const isPathDrawingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);

  // Restore annotator name
  useEffect(() => {
    const stored = localStorage.getItem('annotator_name');
    if (stored) setAnnotatorName(stored);
  }, []);

  // Save name
  const persistAnnotator = (v: string) => {
    setAnnotatorName(v);
    localStorage.setItem('annotator_name', v);
  };

  // Redraw SVG whenever shapes change or container resizes
  useEffect(() => {
    drawShapes();
  }, [shapes]);

  useEffect(() => {
    const onResize = () => drawShapes();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Load existing review for current image
  useEffect(() => {
    if (!image) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${SHEET_PROXY}?image=${encodeURIComponent(image.filename)}`);
        if (!res.ok) {
          setIsLoading(false);
          return;
        }
        const saved = (await res.json()) as ReviewRecord | null;
        if (!saved) {
          resetForm();
          setIsLoading(false);
          return;
        }

        const loadedShapes = (saved.areas || []).map((a: any, idx: number) =>
          deserializeGeometry(a, `shape_${idx}`, a.label || idx + 1)
        );
        setShapes(loadedShapes);
        setScopeChoice(saved.image_scope?.choice || 'field_current');
        setScopeLocation(saved.image_scope?.location || '');
        setScopeObject(saved.image_scope?.object || '');
        setComment(saved.comment || '');
        setAlso(saved.also && saved.also.length ? saved.also : [{ label: '', image: '' }]);

        const dirMap: Record<string, DirectionRow> = {};
        (saved.relative || []).forEach((r) => {
          dirMap[String(r.label)] = {
            label: r.label,
            cardinal: (r.cardinal as Cardinal) || 'N',
            relation: (r.relation as Relation) || 'to',
            location: r.location || '',
            confidence: (r.confidence as Confidence) || 'medium'
          };
        });
        setRelative(dirMap);
        setIsLoading(false);
      } catch (e) {
        console.warn('Failed to load review', e);
        setIsLoading(false);
      }
    };
    load();
  }, [image]);

  const resetForm = () => {
    setShapes([]);
    setScopeChoice('field_current');
    setScopeLocation('');
    setScopeObject('');
    setComment('');
    setAlso([{ label: '', image: '' }]);
    setRelative({});
    setSelectedId(null);
  };

  const nextLabel = () => shapes.length + 1;

  const redrawOverlaySize = () => {
    const img = imgRef.current;
    const svg = svgRef.current;
    if (!img || !svg) return;
    const rect = img.getBoundingClientRect();
    svg.style.width = `${rect.width}px`;
    svg.style.height = `${rect.height}px`;
    svg.setAttribute('width', String(rect.width));
    svg.setAttribute('height', String(rect.height));
  };

  const drawShapes = () => {
    const svg = svgRef.current;
    const img = imgRef.current;
    if (!svg || !img) return;
    redrawOverlaySize();

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const rect = img.getBoundingClientRect();
    shapes
      .slice()
      .sort((a, b) => a.label - b.label)
      .forEach((s) => {
        const stroke = s.color || '#ef4444';
        if (s.type === 'rect') {
          const g = s.geom as RectGeom;
          const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          r.setAttribute('x', String(g.x * rect.width));
          r.setAttribute('y', String(g.y * rect.height));
          r.setAttribute('width', String(g.w * rect.width));
          r.setAttribute('height', String(g.h * rect.height));
          r.setAttribute('fill', 'none');
          r.setAttribute('stroke', stroke);
          r.setAttribute('stroke-width', '2');
          r.style.cursor = 'pointer';
          r.addEventListener('click', () => setSelectedId(s.id));
          svg.appendChild(r);

          const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          label.setAttribute('x', String((g.x + g.w / 2) * rect.width));
          label.setAttribute('y', String((g.y + g.h / 2) * rect.height));
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('dominant-baseline', 'middle');
          label.setAttribute('fill', stroke);
          label.setAttribute('font-size', '18');
          label.setAttribute('stroke', 'white');
          label.setAttribute('stroke-width', '3');
          label.textContent = String(s.label);
          label.style.cursor = 'pointer';
          label.addEventListener('click', () => setSelectedId(s.id));
          svg.appendChild(label);
        } else if (s.type === 'ellipse') {
          const g = s.geom as EllipseGeom;
          const e = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
          e.setAttribute('cx', String(g.cx * rect.width));
          e.setAttribute('cy', String(g.cy * rect.height));
          e.setAttribute('rx', String(g.rx * rect.width));
          e.setAttribute('ry', String(g.ry * rect.height));
          e.setAttribute('fill', 'none');
          e.setAttribute('stroke', stroke);
          e.setAttribute('stroke-width', '2');
          e.style.cursor = 'pointer';
          e.addEventListener('click', () => setSelectedId(s.id));
          svg.appendChild(e);

          const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          label.setAttribute('x', String(g.cx * rect.width));
          label.setAttribute('y', String(g.cy * rect.height));
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('dominant-baseline', 'middle');
          label.setAttribute('fill', stroke);
          label.setAttribute('font-size', '18');
          label.setAttribute('stroke', 'white');
          label.setAttribute('stroke-width', '3');
          label.textContent = String(s.label);
          label.style.cursor = 'pointer';
          label.addEventListener('click', () => setSelectedId(s.id));
          svg.appendChild(label);
        } else {
          const g = s.geom as PathGeom;
          const pts = (g.points || []).map((p) => ({
            x: p.x * rect.width,
            y: p.y * rect.height
          }));
          if (pts.length < 2) return;

          const d = `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', d);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', stroke);
          path.setAttribute('stroke-width', '2');
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          path.style.cursor = 'pointer';
          path.addEventListener('click', () => setSelectedId(s.id));
          svg.appendChild(path);

          const mid = pts[Math.floor(pts.length / 2)];
          const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          label.setAttribute('x', String(mid.x));
          label.setAttribute('y', String(mid.y));
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('dominant-baseline', 'middle');
          label.setAttribute('fill', stroke);
          label.setAttribute('font-size', '18');
          label.setAttribute('stroke', 'white');
          label.setAttribute('stroke-width', '3');
          label.textContent = String(s.label);
          label.style.cursor = 'pointer';
          label.addEventListener('click', () => setSelectedId(s.id));
          svg.appendChild(label);
        }
      });
  };

  const clearTemp = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const el = svg.querySelector('#__temp');
    if (el) el.remove();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;

    svg.setPointerCapture?.(e.pointerId);
    activePointerIdRef.current = e.pointerId;

    if (currentTool === 'path') {
      isPathDrawingRef.current = true;
      const p0 = normalizePoint(rect, e.nativeEvent);
      pathPointsRef.current = [p0];
      clearTemp();

      const temp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      temp.id = '__temp';
      temp.setAttribute('fill', 'none');
      temp.setAttribute('stroke', currentColor);
      temp.setAttribute('stroke-width', '2');
      temp.setAttribute('stroke-linecap', 'round');
      temp.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(temp);
      return;
    }

    setDragStart(normalizePoint(rect, e.nativeEvent));
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
    const rect = svg.getBoundingClientRect();

    if (currentTool === 'path') {
      if (!isPathDrawingRef.current) return;
      const pt = normalizePoint(rect, e.nativeEvent);
      const pts = pathPointsRef.current;
      const last = pts[pts.length - 1];
      const dx = pt.x - last.x;
      const dy = pt.y - last.y;
      // Only append if moved enough (normalized threshold)
      if (dx * dx + dy * dy < 0.000008) return;
      pts.push(pt);
      pathPointsRef.current = pts;

      const temp = svg.querySelector('#__temp') as SVGPathElement | null;
      if (!temp) return;
      const pix = pts.map((p) => ({ x: p.x * rect.width, y: p.y * rect.height }));
      const d = `M ${pix[0].x} ${pix[0].y} ` + pix.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');
      temp.setAttribute('d', d);
      return;
    }

    if (!dragStart) return;
    const current = normalizePoint(rect, e.nativeEvent);
    const tempGeom =
      currentTool === 'rect'
        ? createRectFromPoints(dragStart, current, false)
        : createEllipseFromPoints(dragStart, current, false);
    if (!tempGeom) return;

    clearTemp();
    const el =
      currentTool === 'rect'
        ? document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        : document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    el.id = '__temp';
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', currentColor);
    el.setAttribute('stroke-dasharray', '4 4');
    el.setAttribute('stroke-width', '2');
    if (currentTool === 'rect') {
      const g = tempGeom as RectGeom;
      el.setAttribute('x', String(g.x * rect.width));
      el.setAttribute('y', String(g.y * rect.height));
      el.setAttribute('width', String(g.w * rect.width));
      el.setAttribute('height', String(g.h * rect.height));
    } else {
      const g = tempGeom as EllipseGeom;
      el.setAttribute('cx', String(g.cx * rect.width));
      el.setAttribute('cy', String(g.cy * rect.height));
      el.setAttribute('rx', String(g.rx * rect.width));
      el.setAttribute('ry', String(g.ry * rect.height));
    }
    svg.appendChild(el);
  };

  const finishPointer = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
    const rect = svg.getBoundingClientRect();

    if (currentTool === 'path') {
      if (!isPathDrawingRef.current) return;
      isPathDrawingRef.current = false;
      activePointerIdRef.current = null;
      clearTemp();

      const pts = pathPointsRef.current.slice();
      pathPointsRef.current = [];
      if (pts.length < 10) return;

      // Simple simplification: keep points that move enough; preserve endpoints
      const simplified: PathPoint[] = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i];
        const last = simplified[simplified.length - 1];
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        if (dx * dx + dy * dy >= 0.00002) simplified.push(p);
      }
      simplified.push(pts[pts.length - 1]);
      if (simplified.length < 6) return;

      const newShape: NormalizedShape = {
        id: `shape_${Date.now()}`,
        type: 'path',
        geom: { points: simplified },
        label: nextLabel(),
        color: currentColor
      };
      setShapes((prev) => [...prev, newShape]);
      return;
    }

    if (!dragStart) return;
    const end = normalizePoint(rect, e.nativeEvent);
    const geom =
      currentTool === 'rect'
        ? createRectFromPoints(dragStart, end, true)
        : createEllipseFromPoints(dragStart, end, true);
    clearTemp();
    setDragStart(null);
    activePointerIdRef.current = null;
    if (!geom) return;

    const newShape: NormalizedShape = {
      id: `shape_${Date.now()}`,
      type: currentTool,
      geom,
      label: nextLabel(),
      color: currentColor
    };
    setShapes((prev) => [...prev, newShape]);
  };

  const removeShape = (id: string) => {
    const remaining = shapes
      .filter((s) => s.id !== id)
      .slice()
      .sort((a, b) => a.label - b.label);

    // oldLabel -> newLabel mapping
    const labelMap = new Map<number, number>();
    remaining.forEach((s, idx) => labelMap.set(s.label, idx + 1));

    const renumbered = remaining.map((s) => ({
      ...s,
      label: labelMap.get(s.label) || s.label
    }));

    const rel: Record<string, DirectionRow> = {};
    remaining.forEach((s) => {
      const newLabel = labelMap.get(s.label) || s.label;
      const prev = relative[String(s.label)];
      rel[String(newLabel)] =
        prev
          ? {
              ...prev,
              label: newLabel
            }
          : {
              label: newLabel,
              cardinal: 'N',
              relation: 'to',
              location: '',
              confidence: 'medium'
            };
    });

    setShapes(renumbered);
    setRelative(rel);
    setSelectedId(null);
  };

  const updateDirection = (label: number, updates: Partial<DirectionRow>) => {
    setRelative((prev) => ({
      ...prev,
      [String(label)]: {
        label,
        cardinal: updates.cardinal || prev[String(label)]?.cardinal || 'N',
        relation: updates.relation || prev[String(label)]?.relation || 'to',
        location: updates.location ?? prev[String(label)]?.location ?? '',
        confidence: updates.confidence || prev[String(label)]?.confidence || 'medium'
      }
    }));
  };

  const addAlsoRow = () => setAlso((rows) => [...rows, { label: '', image: '' }]);
  const updateAlso = (idx: number, key: keyof AlsoRow, value: string) =>
    setAlso((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  const removeAlso = (idx: number) => setAlso((rows) => rows.filter((_, i) => i !== idx));

  const scopeDisplay = () => {
    if (scopeChoice === 'field_current') return 'Yes — field of this location';
    if (scopeChoice === 'object_current') return 'No — an object at this location';
    if (scopeChoice === 'field_other') return 'No — the field of another location';
    return 'No — an object at another location';
  };

  const doSubmit = async (status: 'draft' | 'final') => {
    if (!image) return;
    const scope = {
      choice: scopeChoice,
      location: scopeLocation,
      object: scopeObject
    };
    const payload = buildPayload(
      image,
      annotatorName,
      scope,
      shapes.map((s) => ({
        ...(
          relative[String(s.label)] || {
            label: s.label,
            cardinal: 'N',
            relation: 'to',
            location: '',
            confidence: 'medium'
          }
        )
      })),
      also.filter((a) => a.label || a.image),
      comment,
      shapes.map((s) => shapeToArea(s, relative[String(s.label)]?.confidence || 'medium')),
      status
    );

    const form = new URLSearchParams();
    Object.entries(payload).forEach(([k, v]) => form.append(k, String(v)));

    setIsLoading(true);
    try {
      const res = await fetch(SHEET_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      });
      if (!res.ok) throw new Error('Failed to save');
      alert(status === 'draft' ? 'Draft saved' : 'Submitted');
    } catch (e) {
      alert('Error saving review');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  if (!image) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 px-4">
        <div className="text-center space-y-1">
          <div className="text-sm font-medium">Select an image to annotate</div>
          <div className="text-xs text-gray-400">Choose a thumbnail in the schematic or gallery.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white border-l border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Annotation</div>
          <div className="text-sm font-semibold text-gray-900 truncate" title={image.description || image.filename}>
            {image.description || image.filename}
          </div>
          <div className="text-xs text-gray-500 mt-1">{scopeDisplay()}</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="px-2 py-1 text-xs border rounded"
            placeholder="Annotator name"
            value={annotatorName}
            onChange={(e) => persistAnnotator(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {/* Image + drawing surface (top) */}
        <div className="relative bg-gray-50 h-[320px] overflow-hidden border-b border-gray-200">
          <div ref={containerRef} className="absolute inset-0 overflow-hidden">
            <img
              ref={imgRef}
              src={image.url}
              alt={image.description || image.filename}
              className="w-full h-full object-contain select-none"
              onLoad={drawShapes}
            />
            <svg
              ref={svgRef}
              className="absolute inset-0"
              style={{ pointerEvents: 'auto', cursor: 'crosshair' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
            />
          </div>
        </div>

        {/* Form (bottom) */}
        <div className="flex-1 min-h-0 bg-white overflow-y-auto">
          <div className="p-3 space-y-3">
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1">Tool</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentTool('rect')}
                  className={`px-3 py-1.5 text-xs rounded ${
                    currentTool === 'rect' ? 'bg-blue-600 text-white' : 'bg-gray-100'
                  }`}
                >
                  Rectangle
                </button>
                <button
                  onClick={() => setCurrentTool('ellipse')}
                  className={`px-3 py-1.5 text-xs rounded ${
                    currentTool === 'ellipse' ? 'bg-blue-600 text-white' : 'bg-gray-100'
                  }`}
                >
                  Ellipse
                </button>
                <button
                  onClick={() => setCurrentTool('path')}
                  className={`px-3 py-1.5 text-xs rounded ${
                    currentTool === 'path' ? 'bg-blue-600 text-white' : 'bg-gray-100'
                  }`}
                >
                  Freehand
                </button>
                <div className="flex items-center gap-1 ml-1">
                  <button
                    type="button"
                    aria-label="Red"
                    onClick={() => setCurrentColor('#ef4444')}
                    className={`w-6 h-6 rounded-full border-2 ${
                      currentColor === '#ef4444' ? 'border-gray-900' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: '#ef4444' }}
                  />
                  <button
                    type="button"
                    aria-label="Green"
                    onClick={() => setCurrentColor('#22c55e')}
                    className={`w-6 h-6 rounded-full border-2 ${
                      currentColor === '#22c55e' ? 'border-gray-900' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: '#22c55e' }}
                  />
                  <button
                    type="button"
                    aria-label="Blue"
                    onClick={() => setCurrentColor('#3b82f6')}
                    className={`w-6 h-6 rounded-full border-2 ${
                      currentColor === '#3b82f6' ? 'border-gray-900' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: '#3b82f6' }}
                  />
                </div>
                <button
                  onClick={() => setShapes([])}
                  className="ml-auto px-3 py-1.5 text-xs rounded bg-white border border-gray-300 text-gray-700"
                >
                  Clear
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-600 mb-2">Image scope</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  className={`px-2 py-1 rounded border ${
                    scopeChoice === 'field_current' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                  onClick={() => setScopeChoice('field_current')}
                >
                  Yes — field of this location
                </button>
                <button
                  className={`px-2 py-1 rounded border ${
                    scopeChoice === 'object_current' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                  onClick={() => setScopeChoice('object_current')}
                >
                  Object at this location
                </button>
                <button
                  className={`px-2 py-1 rounded border ${
                    scopeChoice === 'field_other' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                  onClick={() => setScopeChoice('field_other')}
                >
                  Field of another location
                </button>
                <button
                  className={`px-2 py-1 rounded border ${
                    scopeChoice === 'object_other' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                  onClick={() => setScopeChoice('object_other')}
                >
                  Object at another location
                </button>
              </div>
              {(scopeChoice === 'object_current' ||
                scopeChoice === 'field_other' ||
                scopeChoice === 'object_other') && (
                <div className="mt-2 space-y-2">
                  <input
                    className="w-full border rounded px-2 py-1 text-sm"
                    placeholder="Location"
                    value={scopeLocation}
                    onChange={(e) => setScopeLocation(e.target.value)}
                  />
                  {(scopeChoice === 'object_current' || scopeChoice === 'object_other') && (
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      placeholder="Object depicted"
                      value={scopeObject}
                      onChange={(e) => setScopeObject(e.target.value)}
                    />
                  )}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-600 mb-2">Direction relative to location</div>
              <div className="space-y-2">
                {shapes
                  .slice()
                  .sort((a, b) => a.label - b.label)
                  .map((s) => {
                    const row = relative[String(s.label)] || {
                      label: s.label,
                      cardinal: 'N',
                      relation: 'to',
                      location: '',
                      confidence: 'medium' as Confidence
                    };
                    return (
                      <div key={s.id} className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded border text-xs bg-gray-50">{s.label}</span>
                        <select
                          className="border rounded px-2 py-1 text-xs"
                          value={row.cardinal}
                          onChange={(e) =>
                            updateDirection(s.label, { cardinal: e.target.value as Cardinal })
                          }
                        >
                          {CARDINALS.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                        <select
                          className="border rounded px-2 py-1 text-xs"
                          value={row.relation}
                          onChange={(e) =>
                            updateDirection(s.label, { relation: e.target.value as Relation })
                          }
                        >
                          {RELATIONS.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                        <select
                          className="border rounded px-2 py-1 text-xs"
                          value={row.confidence}
                          onChange={(e) =>
                            updateDirection(s.label, { confidence: e.target.value as Confidence })
                          }
                          title="Confidence"
                        >
                          {CONFIDENCE.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <input
                          className="flex-1 border rounded px-2 py-1 text-xs"
                          placeholder="Location"
                          value={row.location}
                          onChange={(e) => updateDirection(s.label, { location: e.target.value })}
                        />
                        <button
                          className="text-xs text-red-600 px-2 py-1 border border-red-200 rounded"
                          onClick={() => removeShape(s.id)}
                        >
                          Del
                        </button>
                      </div>
                    );
                  })}
                {shapes.length === 0 && (
                  <div className="text-xs text-gray-500">Draw rectangles/ellipses on the image to add rows.</div>
                )}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-600 mb-2">Also found in</div>
              <div className="space-y-2">
                {also.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      className="w-20 border rounded px-2 py-1 text-xs"
                      placeholder="Label #"
                      value={row.label}
                      onChange={(e) => updateAlso(idx, 'label', e.target.value)}
                    />
                    <input
                      className="flex-1 border rounded px-2 py-1 text-xs"
                      placeholder="Image id / filename"
                      value={row.image}
                      onChange={(e) => updateAlso(idx, 'image', e.target.value)}
                    />
                    <button
                      className="text-xs text-red-600 px-2 py-1 border border-red-200 rounded"
                      onClick={() => removeAlso(idx)}
                    >
                      Del
                    </button>
                  </div>
                ))}
                <button
                  className="text-xs text-blue-700"
                  onClick={addAlsoRow}
                >
                  + Add pair
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1">Comments</div>
              <textarea
                className="w-full border rounded px-2 py-1 text-sm"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => doSubmit('final')}
                disabled={isLoading}
                className="px-4 py-2 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60"
              >
                Submit
              </button>
              <button
                onClick={() => doSubmit('draft')}
                disabled={isLoading}
                className="px-4 py-2 rounded bg-yellow-500 text-gray-900 text-sm hover:bg-yellow-400 disabled:opacity-60"
              >
                Save draft
              </button>
              <button
                onClick={resetForm}
                className="px-3 py-2 rounded bg-white border border-gray-300 text-sm text-gray-700"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
