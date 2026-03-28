import type { Vibe } from './types';

// Global Cache Stores
let globalVibeCache: Vibe[] | null = null;
let globalTopVibeCache: Vibe[] | null = null;
let globalTotalCount: number | null = null;
let lastCacheTime = 0;
export const CACHE_TTL = 1000 * 60 * 5;

export function getCache() {
  return {
    vibes: globalVibeCache,
    topVibes: globalTopVibeCache,
    totalCount: globalTotalCount,
    lastCacheTime,
  };
}

export function isCacheFresh(): boolean {
  return globalVibeCache !== null && (Date.now() - lastCacheTime < CACHE_TTL);
}

export function setVibeCache(vibes: Vibe[]) {
  globalVibeCache = vibes;
  lastCacheTime = Date.now();
}

export function setTopVibeCache(topVibes: Vibe[]) {
  globalTopVibeCache = topVibes;
}

export function setTotalCountCache(count: number) {
  globalTotalCount = count;
}
