/**
 * Performance Metrics Collector
 *
 * Collects Web Vitals (LCP, FCP, FID, CLS, TTFB) and navigation timing metrics.
 * Supports both sync and async collection patterns.
 */

import type { PerformanceData, WebVitals, TimingData, ResourceEntry } from '../types.js';

/**
 * Collect navigation timing metrics from Performance API
 */
export function getNavigationTiming(): TimingData {
  // Try modern PerformanceNavigationTiming API first
  if (typeof performance !== 'undefined' && performance.getEntriesByType) {
    const navEntries = performance.getEntriesByType('navigation');
    if (navEntries.length > 0) {
      const nav = navEntries[0] as PerformanceNavigationTiming;
      return {
        dnsLookup: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
        tcpConnect: Math.round(nav.connectEnd - nav.connectStart),
        ttfb: Math.round(nav.responseStart - nav.requestStart),
        domReady: Math.round(nav.domContentLoadedEventEnd - nav.fetchStart),
        loadComplete: Math.round(nav.loadEventEnd - nav.fetchStart),
      };
    }
  }

  // Fallback to deprecated performance.timing
  if (typeof performance !== 'undefined' && (performance as any).timing) {
    const timing = (performance as any).timing;
    const navStart = timing.navigationStart;

    return {
      dnsLookup: timing.domainLookupEnd - timing.domainLookupStart,
      tcpConnect: timing.connectEnd - timing.connectStart,
      ttfb: timing.responseStart - timing.requestStart,
      domReady: timing.domContentLoadedEventEnd - navStart,
      loadComplete: timing.loadEventEnd - navStart,
    };
  }

  // No performance API available
  return {
    dnsLookup: 0,
    tcpConnect: 0,
    ttfb: 0,
    domReady: 0,
    loadComplete: 0,
  };
}

/**
 * Collect resource waterfall (optional, can be large)
 */
export function getResourceWaterfall(): ResourceEntry[] {
  if (typeof performance === 'undefined' || !performance.getEntriesByType) {
    return [];
  }

  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  return resources.map((resource) => ({
    name: resource.name,
    type: resource.initiatorType,
    duration: Math.round(resource.duration),
    size: resource.transferSize || undefined,
  }));
}

/**
 * Get Web Vitals metrics (async, uses PerformanceObserver)
 *
 * This function returns a promise that resolves with initial metrics
 * and sets up observers to capture metrics as they become available.
 *
 * Note: Some metrics (like LCP, CLS) may update over time. This function
 * captures the final values after a timeout or page visibility change.
 */
export function getWebVitals(timeoutMs: number = 5000): Promise<WebVitals> {
  const vitals: WebVitals = {
    lcp: null,
    fcp: null,
    fid: null,
    cls: null,
    ttfb: null,
  };

  // Early return if PerformanceObserver not available
  if (typeof PerformanceObserver === 'undefined' || typeof performance === 'undefined') {
    return Promise.resolve(vitals);
  }

  return new Promise((resolve) => {
    const observers: PerformanceObserver[] = [];
    let resolved = false;

    // Helper to resolve once
    const resolveOnce = () => {
      if (resolved) return;
      resolved = true;
      observers.forEach((obs) => {
        try {
          obs.disconnect();
        } catch {
          // Ignore errors during disconnect
        }
      });
      resolve(vitals);
    };

    // Set up timeout
    const timeoutId = setTimeout(resolveOnce, timeoutMs);

    try {
      // TTFB - Time to First Byte
      const ttfbObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const navEntry = entries.find((e) => e.entryType === 'navigation');
        if (navEntry) {
          const nav = navEntry as PerformanceNavigationTiming;
          vitals.ttfb = Math.round(nav.responseStart - nav.requestStart);
        }
      });
      ttfbObserver.observe({ type: 'navigation', buffered: true });
      observers.push(ttfbObserver);

      // FCP - First Contentful Paint
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const fcpEntry = entries.find((e) => e.name === 'first-contentful-paint');
        if (fcpEntry) {
          vitals.fcp = Math.round(fcpEntry.startTime);
        }
      });
      fcpObserver.observe({ type: 'paint', buffered: true });
      observers.push(fcpObserver);

      // LCP - Largest Contentful Paint
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          const lastEntry = entries[entries.length - 1];
          if (lastEntry) {
            vitals.lcp = Math.round(lastEntry.startTime);
          }
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      observers.push(lcpObserver);

      // FID - First Input Delay
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0 && vitals.fid === null) {
          const firstEntry = entries[0] as PerformanceEventTiming;
          vitals.fid = Math.round(firstEntry.processingStart - firstEntry.startTime);
          fidObserver.disconnect();
        }
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
      observers.push(fidObserver);

      // CLS - Cumulative Layout Shift
      let clsScore = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShift = entry as LayoutShift;
          if (!layoutShift.hadRecentInput) {
            clsScore += layoutShift.value;
          }
        }
        vitals.cls = Number(clsScore.toFixed(3));
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      observers.push(clsObserver);

      // Resolve early if page becomes hidden
      if (typeof document !== 'undefined') {
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'hidden') {
            clearTimeout(timeoutId);
            resolveOnce();
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange, { once: true });
      }
    } catch (error) {
      // If any observer setup fails, resolve with what we have
      clearTimeout(timeoutId);
      resolveOnce();
    }
  });
}

/**
 * Collect all performance data
 *
 * @param options - Collection options
 * @returns Promise that resolves with complete performance data
 */
export async function collectPerformance(options: {
  includeResources?: boolean;
  webVitalsTimeout?: number;
} = {}): Promise<PerformanceData> {
  const { includeResources = false, webVitalsTimeout = 5000 } = options;

  const [webVitals] = await Promise.all([getWebVitals(webVitalsTimeout)]);

  const data: PerformanceData = {
    webVitals,
    timing: getNavigationTiming(),
  };

  if (includeResources) {
    data.resources = getResourceWaterfall();
  }

  return data;
}

/**
 * LayoutShift interface (not in standard TypeScript lib)
 */
interface LayoutShift extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}
