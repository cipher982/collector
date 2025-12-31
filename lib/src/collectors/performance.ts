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
 * @param timeoutMs - Max time to wait for metrics
 * @param metrics - Which metrics to collect. Default: all. Recommended: ['ttfb', 'fcp', 'lcp']
 * @param onMetric - Callback when a metric is observed
 */
export function getWebVitals(
  timeoutMs: number = 5000,
  metrics: Array<keyof WebVitals> = ['ttfb', 'fcp', 'lcp', 'fid', 'cls'],
  onMetric?: (metric: keyof WebVitals, value: number, observedAfterMs: number) => void
): Promise<WebVitals> {
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

  // No metrics requested
  if (metrics.length === 0) {
    return Promise.resolve(vitals);
  }

  const metricsSet = new Set(metrics);

  return new Promise((resolve) => {
    const observers: PerformanceObserver[] = [];
    let resolved = false;
    const startedAt = performance.now();
    const collected = new Set<keyof WebVitals>();

    const noteMetric = (metric: keyof WebVitals, value: number) => {
      if (collected.has(metric)) return;
      collected.add(metric);
      const t = performance.now() - startedAt;
      if (onMetric) {
        try {
          onMetric(metric, value, t);
        } catch {
          // ignore user callback failures
        }
      }
      // Resolve early if all requested metrics collected
      if (collected.size >= metricsSet.size) {
        clearTimeout(timeoutId);
        resolveOnce();
      }
    };

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
      if (metricsSet.has('ttfb')) {
        const ttfbObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const navEntry = entries.find((e) => e.entryType === 'navigation');
          if (navEntry) {
            const nav = navEntry as PerformanceNavigationTiming;
            const v = Math.round(nav.responseStart - nav.requestStart);
            vitals.ttfb = v;
            noteMetric('ttfb', v);
          }
        });
        ttfbObserver.observe({ type: 'navigation', buffered: true });
        observers.push(ttfbObserver);
      }

      // FCP - First Contentful Paint
      if (metricsSet.has('fcp')) {
        const fcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const fcpEntry = entries.find((e) => e.name === 'first-contentful-paint');
          if (fcpEntry) {
            const v = Math.round(fcpEntry.startTime);
            vitals.fcp = v;
            noteMetric('fcp', v);
          }
        });
        fcpObserver.observe({ type: 'paint', buffered: true });
        observers.push(fcpObserver);
      }

      // LCP - Largest Contentful Paint
      if (metricsSet.has('lcp')) {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            const lastEntry = entries[entries.length - 1];
            if (lastEntry) {
              const v = Math.round(lastEntry.startTime);
              vitals.lcp = v;
              noteMetric('lcp', v);
            }
          }
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
        observers.push(lcpObserver);
      }

      // FID - First Input Delay (requires user interaction - often never fires)
      if (metricsSet.has('fid')) {
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0 && vitals.fid === null) {
            const firstEntry = entries[0] as PerformanceEventTiming;
            const v = Math.round(firstEntry.processingStart - firstEntry.startTime);
            vitals.fid = v;
            noteMetric('fid', v);
            fidObserver.disconnect();
          }
        });
        fidObserver.observe({ type: 'first-input', buffered: true });
        observers.push(fidObserver);
      }

      // CLS - Cumulative Layout Shift (keeps updating - can cause long waits)
      if (metricsSet.has('cls')) {
        let clsScore = 0;
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const layoutShift = entry as LayoutShift;
            if (!layoutShift.hadRecentInput) {
              clsScore += layoutShift.value;
            }
          }
          const v = Number(clsScore.toFixed(3));
          vitals.cls = v;
          noteMetric('cls', v);
        });
        clsObserver.observe({ type: 'layout-shift', buffered: true });
        observers.push(clsObserver);
      }

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
  includeWebVitals?: boolean;
  includeNavigationTiming?: boolean;
  includeResources?: boolean;
  webVitalsTimeout?: number;
  webVitalsMetrics?: Array<keyof WebVitals>;
} = {}): Promise<PerformanceData> {
  const {
    includeWebVitals = true,
    includeNavigationTiming = true,
    includeResources = false,
    webVitalsTimeout = 500,
    webVitalsMetrics = ['ttfb', 'fcp', 'lcp'],
  } = options;

  const emptyWebVitals: WebVitals = {
    lcp: null,
    fcp: null,
    fid: null,
    cls: null,
    ttfb: null,
  };

  const webVitals = includeWebVitals ? await getWebVitals(webVitalsTimeout, webVitalsMetrics) : emptyWebVitals;
  const timing: TimingData = includeNavigationTiming
    ? getNavigationTiming()
    : { dnsLookup: 0, tcpConnect: 0, ttfb: 0, domReady: 0, loadComplete: 0 };

  const data: PerformanceData = { webVitals, timing };

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
