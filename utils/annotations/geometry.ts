export type ShapeType = 'rect' | 'ellipse' | 'path';

export interface RectGeom {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EllipseGeom {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface PathPoint {
  x: number;
  y: number;
}

export interface PathGeom {
  points: PathPoint[];
}

export interface NormalizedShape {
  id: string;
  type: ShapeType;
  geom: RectGeom | EllipseGeom | PathGeom;
  label: number;
  color?: string;
}

export type GeometryPayload =
  | ({ type: 'rect'; label?: number; color?: string } & RectGeom)
  | ({ type: 'ellipse'; label?: number; color?: string } & EllipseGeom)
  | { type: 'path'; points: PathPoint[]; label?: number; color?: string };

export interface DragPoint {
  x: number;
  y: number;
}

const MIN_SIZE = 0.005;

const DEFAULT_COLOR = '#ef4444';

export function deserializeGeometry(
  geometry: any,
  fallbackId: string,
  fallbackLabel: number
): NormalizedShape {
  const parsed = typeof geometry === 'string' ? safeParseGeometry(geometry) : geometry;
  const type: ShapeType =
    parsed?.type === 'ellipse' ? 'ellipse' : parsed?.type === 'path' ? 'path' : 'rect';

  const geom: RectGeom | EllipseGeom | PathGeom =
    type === 'rect'
      ? {
          x: parsed?.x ?? 0,
          y: parsed?.y ?? 0,
          w: parsed?.w ?? 0,
          h: parsed?.h ?? 0
        }
      : type === 'ellipse'
        ? {
            cx: parsed?.cx ?? 0.5,
            cy: parsed?.cy ?? 0.5,
            rx: parsed?.rx ?? 0.1,
            ry: parsed?.ry ?? 0.1
          }
        : {
            points: Array.isArray(parsed?.points)
              ? parsed.points
                  .map((p: any) => ({ x: clamp01(p?.x ?? 0), y: clamp01(p?.y ?? 0) }))
                  .filter((p: PathPoint) => Number.isFinite(p.x) && Number.isFinite(p.y))
              : []
          };

  return {
    id: parsed?.id || fallbackId,
    type,
    geom,
    label: parsed?.label ?? fallbackLabel,
    color: parsed?.color || DEFAULT_COLOR
  };
}

export function serializeShapeGeometry(shape: NormalizedShape): GeometryPayload {
  if (shape.type === 'rect') {
    return {
      type: 'rect',
      ...(shape.geom as RectGeom),
      label: shape.label,
      color: shape.color || DEFAULT_COLOR
    };
  }

  if (shape.type === 'ellipse') {
    return {
      type: 'ellipse',
      ...(shape.geom as EllipseGeom),
      label: shape.label,
      color: shape.color || DEFAULT_COLOR
    };
  }

  return {
    type: 'path',
    points: (shape.geom as PathGeom).points || [],
    label: shape.label,
    color: shape.color || DEFAULT_COLOR
  };
}

export function createRectFromPoints(
  start: DragPoint,
  current: DragPoint,
  enforceMin = true
): RectGeom | null {
  const x1 = Math.min(start.x, current.x);
  const y1 = Math.min(start.y, current.y);
  const w = Math.abs(current.x - start.x);
  const h = Math.abs(current.y - start.y);

  if (enforceMin && (w < MIN_SIZE || h < MIN_SIZE)) {
    return null;
  }

  return { x: x1, y: y1, w, h };
}

export function createEllipseFromPoints(
  start: DragPoint,
  current: DragPoint,
  enforceMin = true
): EllipseGeom | null {
  const cx = (start.x + current.x) / 2;
  const cy = (start.y + current.y) / 2;
  const rx = Math.abs(current.x - start.x) / 2;
  const ry = Math.abs(current.y - start.y) / 2;

  if (enforceMin && (rx < MIN_SIZE || ry < MIN_SIZE)) {
    return null;
  }

  return { cx, cy, rx, ry };
}

function safeParseGeometry(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function distSq(a: PathPoint, b: PathPoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Lightweight path simplification.
 * Keeps points that are at least `minDist` away from the last kept point,
 * always preserving the first and last points.
 */
export function simplifyPath(points: PathPoint[], minDist = 0.003): PathPoint[] {
  if (!Array.isArray(points) || points.length <= 2) return points || [];
  const minDistSq = minDist * minDist;

  const out: PathPoint[] = [];
  const first = points[0];
  out.push({ x: clamp01(first.x), y: clamp01(first.y) });

  let lastKept = first;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    if (distSq(p, lastKept) >= minDistSq) {
      out.push({ x: clamp01(p.x), y: clamp01(p.y) });
      lastKept = p;
    }
  }

  const last = points[points.length - 1];
  out.push({ x: clamp01(last.x), y: clamp01(last.y) });
  return out;
}

