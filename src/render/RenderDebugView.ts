export const RENDER_DEBUG_VIEWS = [
  { id: 'final', label: 'Final Grade' },
  { id: 'scene-color', label: 'Scene Color' },
  { id: 'luma', label: 'Luma' },
  { id: 'depth', label: 'Depth' },
  { id: 'fog', label: 'Fog Factor' },
  { id: 'water-mask', label: 'Water Mask' },
  { id: 'water-depth', label: 'Water Depth' },
  { id: 'world-height', label: 'World Height' },
] as const;

export type RenderDebugViewId = (typeof RENDER_DEBUG_VIEWS)[number]['id'];

const VIEW_INDEX_LOOKUP = new Map<RenderDebugViewId, number>(
  RENDER_DEBUG_VIEWS.map((view, index) => [view.id, index]),
);

export function isRenderDebugViewId(value: string): value is RenderDebugViewId {
  return VIEW_INDEX_LOOKUP.has(value as RenderDebugViewId);
}

export function getRenderDebugViewIndex(view: RenderDebugViewId): number {
  return VIEW_INDEX_LOOKUP.get(view) ?? 0;
}

export function getRenderDebugViewLabel(view: RenderDebugViewId): string {
  return (
    RENDER_DEBUG_VIEWS.find((candidate) => candidate.id === view)?.label
    ?? RENDER_DEBUG_VIEWS[0].label
  );
}

export function cycleRenderDebugView(
  current: RenderDebugViewId,
  direction: -1 | 1,
): RenderDebugViewId {
  const index = getRenderDebugViewIndex(current);
  const nextIndex =
    (index + direction + RENDER_DEBUG_VIEWS.length) % RENDER_DEBUG_VIEWS.length;
  return RENDER_DEBUG_VIEWS[nextIndex]?.id ?? RENDER_DEBUG_VIEWS[0].id;
}
