import { useEffect, useSyncExternalStore } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router';

/** An artist page on the way: where it is and whose it is. */
export interface TrailStep {
  path: string;
  name: string;
}

/** The location state of a link from one artist to another: the trail goes on. */
export const DISCOVERY = { discovery: true } as const;

const KEY = 'aubesonore:trail';
// Past six names a trail no longer helps find the way back; the oldest go.
const MAX_STEPS = 6;

/**
 * The trail once `step` is shown. A step already on it cuts it there (back,
 * or a tap on an earlier name); a link from an artist adds it; anywhere else
 * (the home page, the search, a shared link) starts a new trail.
 */
export function nextTrail(
  trail: readonly TrailStep[],
  step: TrailStep,
  how: 'link' | 'back' | 'elsewhere'
): TrailStep[] {
  const at = trail.findIndex((s) => s.path === step.path);
  if (at >= 0 && how !== 'elsewhere') return [...trail.slice(0, at), step];
  if (how === 'link') return [...trail, step].slice(-MAX_STEPS);
  return [step];
}

function isStep(value: unknown): value is TrailStep {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as TrailStep).path === 'string' &&
    typeof (value as TrailStep).name === 'string'
  );
}

// The trail is an external store over sessionStorage: what a page reads
// while rendering is what was last written, and a write re-renders readers.
const listeners = new Set<() => void>();
let snapshot: string | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string {
  if (snapshot === null) {
    try {
      snapshot = sessionStorage.getItem(KEY) ?? '[]';
    } catch {
      snapshot = '[]';
    }
  }
  return snapshot;
}

function parse(raw: string): TrailStep[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isStep) : [];
  } catch {
    return [];
  }
}

function write(steps: TrailStep[]) {
  snapshot = JSON.stringify(steps);
  try {
    sessionStorage.setItem(KEY, snapshot);
  } catch {
    // Storage refused (private mode): the trail lives as long as the page.
  }
  for (const listener of listeners) listener();
}

/**
 * The artists walked through in this tab, up to the one shown: kept per tab
 * (sessionStorage), so a new tab starts its own way. `step` is null while the
 * page loads.
 */
export function useDiscoveryTrail(step: TrailStep | null): TrailStep[] {
  const location = useLocation();
  const navigation = useNavigationType();
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => '[]');
  const path = step?.path;
  const name = step?.name;
  const linked = (location.state as { discovery?: boolean } | null)?.discovery === true;

  useEffect(() => {
    if (path === undefined || name === undefined) return;
    const how = navigation === NavigationType.Pop ? 'back' : linked ? 'link' : 'elsewhere';
    write(nextTrail(parse(getSnapshot()), { path, name }, how));
  }, [path, name, navigation, linked, location.key]);

  const trail = parse(raw);
  // Until this page's step is written, the trail is the previous page's.
  return trail.at(-1)?.path === path ? trail : [];
}
