/**
 * Lightweight profiling utility for collection timing
 *
 * Designed to work in both browser and non-browser environments.
 */

import type { CollectionProfile, ProfileStep } from '../types.js';

function nowMs(): number {
  // Prefer high-resolution timer in browsers
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export function createProfiler() {
  const startedAtMs = nowMs();
  const steps: ProfileStep[] = [];

  async function step<T>(
    name: string,
    fn: () => T | Promise<T>,
    meta?: Record<string, any> | ((value: T) => Record<string, any>)
  ): Promise<T> {
    const startMs = nowMs();
    try {
      const value = await fn();
      const endMs = nowMs();
      const resolvedMeta =
        typeof meta === 'function' ? (meta as (v: T) => Record<string, any>)(value) : meta;
      steps.push({
        name,
        status: 'ok',
        startMs,
        endMs,
        durationMs: endMs - startMs,
        meta: resolvedMeta,
      });
      return value;
    } catch (err) {
      const endMs = nowMs();
      const resolvedMeta = typeof meta === 'function' ? undefined : meta;
      steps.push({
        name,
        status: 'error',
        startMs,
        endMs,
        durationMs: endMs - startMs,
        errorMessage: err instanceof Error ? err.message : String(err),
        meta: resolvedMeta,
      });
      throw err;
    }
  }

  function skip(name: string, meta?: Record<string, any>) {
    const t = nowMs();
    steps.push({
      name,
      status: 'skipped',
      startMs: t,
      endMs: t,
      durationMs: 0,
      meta,
    });
  }

  function finish(): CollectionProfile {
    const endedAtMs = nowMs();
    return {
      startedAtMs,
      endedAtMs,
      durationMs: endedAtMs - startedAtMs,
      steps,
    };
  }

  return { step, skip, finish };
}
