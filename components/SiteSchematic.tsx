import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from '../store/useStore';

interface SiteSchematicProps {
  siteId: string;
  images: Image[];
  onImageSelect?: (imageId: string) => void;
  onImageOpen?: (imageId: string) => void;
}

type Position = { x: number; y: number };
type PositionsMap = Record<string, Position>;

export default function SiteSchematic({ siteId, images, onImageSelect, onImageOpen }: SiteSchematicProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<PositionsMap>({});
  const positionsRef = useRef<PositionsMap>({});
  const [positionsLoaded, setPositionsLoaded] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [showIds, setShowIds] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const hasCenteredRef = useRef<string | null>(null);
  const mouseDownAbsRef = useRef<Position | null>(null);
  const lastMouseAbsRef = useRef<Position | null>(null);

  // Virtual board size (scrollable area)
  const BOARD_WIDTH = 4096;
  const BOARD_HEIGHT = 4096;

  // Fetch saved positions
  useEffect(() => {
    if (!siteId) return;
    setPositionsLoaded(false);
    fetch(`/api/sites/${siteId}/image-positions`)
      .then(r => r.json())
      .then(data => {
        const saved: PositionsMap = data.positions || {};
        setPositions(saved);
        positionsRef.current = saved;
      })
      .catch(() => {
        setPositions({});
        positionsRef.current = {};
      })
      .finally(() => setPositionsLoaded(true));
  }, [siteId]);

  const containerSize = useSize(containerRef);

  // Center scroll on board center when site changes or container first lays out
  useEffect(() => {
    if (!containerRef.current) return;
    if (hasCenteredRef.current === siteId) return;
    const c = containerRef.current;
    const left = Math.max(0, (BOARD_WIDTH - c.clientWidth) / 2);
    const top = Math.max(0, (BOARD_HEIGHT - c.clientHeight) / 2);
    c.scrollTo({ left, top });
    hasCenteredRef.current = siteId;
  }, [siteId, containerSize.width, containerSize.height]);

  // Compute auto-grid for images missing positions (around center)
  const autoGrid = useMemo(() => {
    if (!positionsLoaded) return {} as PositionsMap;
    const thumb = 128;
    const gap = 24;
    const idsNeeding = images
      .map(img => img.id)
      .filter(id => positions[id] === undefined);
    if (idsNeeding.length === 0) return {} as PositionsMap;

    // Create spiral grid around (0,0)
    const result: PositionsMap = {};
    let ring = 0;
    let placed = 0;
    const step = thumb + gap;
    const maxPerRing = (n: number) => (n === 0 ? 1 : n * 8);
    for (const id of idsNeeding) {
      if (ring === 0) {
        result[id] = { x: 0, y: 0 };
        ring = 1;
        placed++;
        continue;
      }
      // positions on a square ring
      const per = maxPerRing(ring);
      const indexInRing = (placed - 1) % per; // 0..per-1
      const sideLen = ring * 2;
      const coords: Array<{ x: number; y: number }> = [];
      // build ring coordinates centered at 0
      for (let i = -ring; i < ring; i++) coords.push({ x: i, y: -ring });
      for (let i = -ring; i < ring; i++) coords.push({ x: ring, y: i });
      for (let i = ring; i > -ring; i--) coords.push({ x: i, y: ring });
      for (let i = ring; i > -ring; i--) coords.push({ x: -ring, y: i });
      const cell = coords[indexInRing % coords.length];
      result[id] = { x: cell.x * step, y: cell.y * step };
      placed++;
      if ((placed - 1) % per === 0) ring++;
    }
    return result;
  }, [images, positions, positionsLoaded]);

  // If there are new positions from autoGrid, merge them and save once
  useEffect(() => {
    if (!positionsLoaded) return;
    const newIds = Object.keys(autoGrid);
    if (newIds.length === 0) return;
    const merged = { ...positions, ...autoGrid };
    setPositions(merged);
    positionsRef.current = merged;
    // Save once for initialization
    savePositionsDebounced(merged, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGrid]);

  const centerToAbsolute = useCallback((p: Position): Position => {
    return {
      x: (BOARD_WIDTH / 2) + p.x,
      y: (BOARD_HEIGHT / 2) + p.y,
    };
  }, [BOARD_WIDTH, BOARD_HEIGHT]);

  const absoluteToCenter = useCallback((p: Position): Position => {
    return {
      x: p.x - (BOARD_WIDTH / 2),
      y: p.y - (BOARD_HEIGHT / 2),
    };
  }, [BOARD_WIDTH, BOARD_HEIGHT]);

  const clampToBounds = useCallback((abs: Position, thumbW: number, thumbH: number): Position => {
    const x = Math.max(thumbW / 2, Math.min(BOARD_WIDTH - thumbW / 2, abs.x));
    const y = Math.max(thumbH / 2, Math.min(BOARD_HEIGHT - thumbH / 2, abs.y));
    return { x, y };
  }, [BOARD_WIDTH, BOARD_HEIGHT]);

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const target = e.currentTarget as HTMLDivElement;
    const targetRect = target.getBoundingClientRect();

    // Mouse position relative to board (account for scroll)
    const mouseX = (e.clientX - containerRect.left) + containerRef.current.scrollLeft;
    const mouseY = (e.clientY - containerRect.top) + containerRef.current.scrollTop;

    // Element center relative to board
    const centerX = (targetRect.left - containerRect.left + targetRect.width / 2) + containerRef.current.scrollLeft;
    const centerY = (targetRect.top - containerRect.top + targetRect.height / 2) + containerRef.current.scrollTop;

    setDraggingId(id);
    setDragOffset({ dx: mouseX - centerX, dy: mouseY - centerY });
    mouseDownAbsRef.current = { x: mouseX, y: mouseY };
    lastMouseAbsRef.current = { x: mouseX, y: mouseY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingId || !containerRef.current) return;
    e.preventDefault();
    const thumbW = 64;
    const thumbH = 64;
    const containerRect = containerRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - containerRect.left) + containerRef.current.scrollLeft;
    const mouseY = (e.clientY - containerRect.top) + containerRef.current.scrollTop;
    const abs = clampToBounds({ x: mouseX - dragOffset.dx, y: mouseY - dragOffset.dy }, thumbW, thumbH);
    const rel = absoluteToCenter(abs);
    setPositions((prev) => {
      const next = { ...prev, [draggingId]: rel };
      positionsRef.current = next;
      return next;
    });
    lastMouseAbsRef.current = { x: mouseX, y: mouseY };
  };

  const handleMouseUp = () => {
    if (!draggingId) return;
    const id = draggingId;
    setDraggingId(null);

    // Determine click vs drag based on movement threshold
    const CLICK_THRESHOLD = 5; // px mouse movement
    const start = mouseDownAbsRef.current;
    const last = lastMouseAbsRef.current;
    mouseDownAbsRef.current = null;
    lastMouseAbsRef.current = null;

    if (start && last) {
      const dx = last.x - start.x;
      const dy = last.y - start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= CLICK_THRESHOLD) {
        if (onImageSelect) onImageSelect(id);
        return; // don't save if it was just a click
      }
    }

    // Save the latest snapshot (state updates are async, so don't rely on `positions` here)
    // Save immediately so we don't lose the update on navigation/unmount.
    savePositionsDebounced(positionsRef.current, true);
  };

  const savePositionsDebounced = (next: PositionsMap, immediate = false) => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const run = async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}/image-positions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positions: next })
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          console.warn('Failed to persist image positions', res.status, text);
        }
      } catch (e) {
        console.warn('Failed to persist image positions', e);
      }
    };
    if (immediate) run();
    else saveTimer.current = window.setTimeout(run, 400);
  };

  // If we ever have a pending debounce, flush on unmount so we don't lose writes on navigation.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        savePositionsDebounced(positionsRef.current, true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderNorthArrow = () => (
    <div
      className="absolute -translate-x-1/2 text-gray-700 select-none pointer-events-none flex flex-col items-center z-10"
      style={{ left: BOARD_WIDTH / 2, top: BOARD_HEIGHT / 2 - 46 }}
    >
      <svg className="relative top-[2px]" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l4 7h-8l4-7z" />
      </svg>
      <div className="text-xs font-semibold">N</div>
    </div>
  );

  const renderCenterDot = () => (
    <div className="absolute z-10" style={{ left: BOARD_WIDTH / 2 - 3, top: BOARD_HEIGHT / 2 - 3 }}>
      <div className="w-1.5 h-1.5 rounded-full bg-red-600 opacity-80 pointer-events-none" />
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="text-sm text-gray-600">{images.length} image{images.length !== 1 ? 's' : ''}</div>
        <div className="flex items-center gap-2">
          <button
            className="text-sm border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
            onClick={() => {
              const next = { ...positions };
              // Remove only those with existing positions so autoGrid re-adds them
              for (const img of images) delete next[img.id];
              setPositions(next);
              positionsRef.current = next;
            }}
          >
            Reset layout
          </button>
          <label className="text-sm text-gray-600 inline-flex items-center gap-1">
            <input type="checkbox" checked={showIds} onChange={(e) => setShowIds(e.target.checked)} /> Show IDs
          </label>
        </div>
      </div>

      {/* Board */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-auto bg-white"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          ref={boardRef}
          className="relative"
          style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT, backgroundImage: 'repeating-linear-gradient(0deg, #f7fafc, #f7fafc 24px, #edf2f7 24px, #edf2f7 25px), repeating-linear-gradient(90deg, #f7fafc, #f7fafc 24px, #edf2f7 24px, #edf2f7 25px)' }}
        >
          {renderNorthArrow()}
          {renderCenterDot()}

          {images.map((img) => {
            const rel = positions[img.id];
            const fallbackAbs = { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 };
            const abs = rel ? centerToAbsolute(rel) : fallbackAbs;
            const size = 64;
            const style: React.CSSProperties = {
              position: 'absolute',
              left: abs.x - size / 2,
              top: abs.y - size / 2,
              width: size,
              height: size,
              cursor: draggingId === img.id ? 'grabbing' : 'grab',
              boxShadow: draggingId === img.id ? '0 8px 16px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.08)' ,
              borderRadius: 8,
              overflow: 'hidden',
              background: '#fff',
              border: '2px solid #e5e7eb'
            };
            return (
              <div
                key={img.id}
                style={style}
                onMouseDown={(e) => handleMouseDown(e, img.id)}
                onDoubleClick={() => onImageOpen && onImageOpen(img.id)}
              >
                <img
                  src={img.url}
                  alt={img.description || img.filename}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', userSelect: 'none', pointerEvents: 'none' }}
                  draggable={false}
                />
                {showIds && (
                  <div className="absolute bottom-0 left-0 right-0 text-[10px] bg-black/50 text-white px-1 py-0.5">{img.id}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function useSize(ref: React.RefObject<HTMLElement>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const observer = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, [ref]);
  return size;
}


