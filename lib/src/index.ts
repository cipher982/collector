/**
 * Visitor Context Library
 *
 * Lightweight, tree-shakeable library for collecting browser/device context,
 * performance metrics, and fingerprinting data.
 */

// Configuration
export { configure, getConfig, resetConfig, defaultConfig } from './config.js';

// Types
export type {
  // Note: VisitorContext type exported as VisitorContextData to avoid conflict with VisitorContext namespace
  VisitorContext as VisitorContextData,
  IdentityData,
  BrowserInfo,
  DeviceInfo,
  LocaleInfo,
  PerformanceData,
  WebVitals,
  TimingData,
  ResourceEntry,
  NetworkData,
  WebGLInfo,
  FingerprintData,
  BatteryData,
  GpuData,
  LibraryConfig,
  ModuleConfig,
  FingerprintConfig,
  PerformanceConfig,
  IdentityConfig,
  CollectionProfile,
  ProfileStep,
} from './types.js';

// Core modules
export {
  collectIdentity,
  getVisitorId,
  getSessionId,
  getPageviewId,
} from './core/identity.js';

// Event emitter
export {
  emitEvent,
  sendEvent,
  flushEvents,
  resetEmitter,
} from './core/emitter.js';

export type { EventData } from './core/emitter.js';

// Collectors - Context
export {
  getBrowserInfo,
  getDeviceInfo,
  getLocaleInfo,
  collectContext,
} from './collectors/context.js';

// Collectors - Performance
export {
  getNavigationTiming,
  getResourceWaterfall,
  getWebVitals,
  collectPerformance,
} from './collectors/performance.js';

// Collectors - Network
export {
  getNetworkInfo,
  measureLatency,
  measureBandwidth,
  collectNetworkInfo,
} from './collectors/network.js';

// Collectors - Fingerprint
export {
  getCanvasFingerprint,
  getCanvasFingerprintHash,
  detectFonts,
  getWebGLInfo,
  collectFingerprint,
} from './collectors/fingerprint.js';

// Utilities
export {
  storage,
  getStorageItem,
  setStorageItem,
  removeStorageItem,
} from './utils/storage.js';

// Main collection API
import type { CollectionProfile, VisitorContext as VisitorContextType, WebVitals } from './types.js';
import { getConfig } from './config.js';
import { collectIdentity } from './core/identity.js';
import { collectContext } from './collectors/context.js';
import { collectPerformance } from './collectors/performance.js';
import { collectNetworkInfo } from './collectors/network.js';
import { collectFingerprint } from './collectors/fingerprint.js';
import { createProfiler } from './core/profiler.js';
import {
  getBrowserInfo,
  getDeviceInfo,
  getLocaleInfo,
} from './collectors/context.js';
import { getNavigationTiming, getResourceWaterfall, getWebVitals } from './collectors/performance.js';
import { getNetworkInfo } from './collectors/network.js';
import { getCanvasFingerprintHash, detectFonts, getWebGLInfo } from './collectors/fingerprint.js';

/**
 * Collect complete visitor context
 *
 * Collects all enabled modules based on configuration and returns
 * a complete VisitorContext object. This is the main entry point
 * for collecting visitor data.
 *
 * @returns Complete visitor context
 *
 * @example
 * ```typescript
 * import { collect, VisitorContext } from '@collector/context';
 *
 * // Option 1: Direct function call
 * const ctx = await collect();
 *
 * // Option 2: Namespace style
 * const ctx = await VisitorContext.collect();
 *
 * console.log(ctx.browser.userAgent);
 * console.log(ctx.identity.visitorId);
 * ```
 */
export async function collect(): Promise<VisitorContextType> {
  const config = getConfig();

  // Always collect identity and context (required)
  const identity = collectIdentity(config.identity);
  const contextData = collectContext();

  // Build base context
  const result: VisitorContextType = {
    identity,
    browser: contextData.browser,
    device: contextData.device,
    locale: contextData.locale,
  };

  // Collect optional modules based on configuration (in parallel)
  const performancePromise = config.modules.performance
    ? collectPerformance({
        includeWebVitals: config.performance.webVitals,
        includeNavigationTiming: config.performance.navigationTiming,
        includeResources: config.performance.resourceWaterfall,
        webVitalsTimeout: config.performance.webVitalsTimeoutMs ?? 500,
        webVitalsMetrics: config.performance.webVitalsMetrics ?? ['ttfb', 'fcp', 'lcp'],
      })
    : Promise.resolve(undefined);

  const networkPromise = config.modules.network ? collectNetworkInfo() : Promise.resolve(undefined);

  const fingerprintPromise = config.modules.fingerprint
    ? Promise.resolve(
        collectFingerprint({
          canvas: config.fingerprint.canvas,
          fonts: config.fingerprint.fonts,
          webgl: config.fingerprint.webgl,
        })
      )
    : Promise.resolve(undefined);

  const [performance, network, fingerprint] = await Promise.all([
    performancePromise,
    networkPromise,
    fingerprintPromise,
  ]);

  if (performance) result.performance = performance;
  if (network) result.network = network;
  if (fingerprint) result.fingerprint = fingerprint;

  // Note: battery and gpu modules not implemented yet (future phases)
  // if (config.modules.battery) {
  //   result.battery = await collectBattery();
  // }
  //
  // if (config.modules.gpu) {
  //   result.gpu = await collectGpu();
  // }

  return result;
}

/**
 * Collect complete visitor context with step-level timing
 *
 * This is intended for debugging and tuning collection latency. It returns the
 * same context shape as `collect()`, along with a detailed timing breakdown.
 */
export async function collectProfiled(options: {
  webVitalsTimeoutMs?: number;
  includeWebVitals?: boolean;
  includeResources?: boolean;
  includeNavigationTiming?: boolean;
  includeFingerprint?: boolean;
  includeNetwork?: boolean;
  consoleLog?: boolean;
} = {}): Promise<{ ctx: VisitorContextType; profile: CollectionProfile }> {
  const config = getConfig();
  const profiler = createProfiler();

  const identity = await profiler.step('identity', () => collectIdentity(config.identity));
  const browser = await profiler.step('context.browser', () => getBrowserInfo());
  const device = await profiler.step('context.device', () => getDeviceInfo());
  const locale = await profiler.step('context.locale', () => getLocaleInfo());

  const ctx: VisitorContextType = { identity, browser, device, locale };

  const includeNetwork = options.includeNetwork ?? config.modules.network;
  const includeFingerprint = options.includeFingerprint ?? config.modules.fingerprint;
  const includeWebVitals = options.includeWebVitals ?? (config.modules.performance && config.performance.webVitals);
  const includeNavigationTiming =
    options.includeNavigationTiming ?? (config.modules.performance && config.performance.navigationTiming);
  const includeResources = options.includeResources ?? (config.modules.performance && config.performance.resourceWaterfall);
  const webVitalsTimeoutMs = options.webVitalsTimeoutMs ?? config.performance.webVitalsTimeoutMs ?? 5000;

  // Performance (broken out so you can see what blocks)
  const webVitalsMetrics = config.performance.webVitalsMetrics ?? ['ttfb', 'fcp', 'lcp'];
  if (config.modules.performance) {
    if (includeWebVitals) {
      const metricObservedAfterMs: Partial<Record<keyof WebVitals, number>> = {};
      const webVitals = await profiler.step(
        'performance.webVitals',
        () =>
          getWebVitals(
            webVitalsTimeoutMs,
            webVitalsMetrics,
            (metric: keyof WebVitals, _value: number, observedAfterMs: number) => {
              metricObservedAfterMs[metric] = observedAfterMs;
            }
          ),
        () => ({
          timeoutMs: webVitalsTimeoutMs,
          metrics: webVitalsMetrics,
          metricObservedAfterMs: { ...metricObservedAfterMs },
        })
      );
      const timing = includeNavigationTiming
        ? await profiler.step('performance.navigationTiming', () => getNavigationTiming())
        : (profiler.skip('performance.navigationTiming', { reason: 'disabled_by_config' }),
          { dnsLookup: 0, tcpConnect: 0, ttfb: 0, domReady: 0, loadComplete: 0 });
      ctx.performance = { webVitals, timing };

      if (includeResources) {
        ctx.performance.resources = await profiler.step('performance.resourceWaterfall', () =>
          getResourceWaterfall()
        );
      } else {
        profiler.skip('performance.resourceWaterfall');
      }
    } else {
      profiler.skip('performance.webVitals', { reason: 'disabled' });
      const timing = includeNavigationTiming
        ? await profiler.step('performance.navigationTiming', () => getNavigationTiming())
        : (profiler.skip('performance.navigationTiming', { reason: 'disabled_by_config' }),
          { dnsLookup: 0, tcpConnect: 0, ttfb: 0, domReady: 0, loadComplete: 0 });
      const emptyWebVitals: WebVitals = { lcp: null, fcp: null, fid: null, cls: null, ttfb: null };
      ctx.performance = { webVitals: emptyWebVitals, timing };
      if (includeResources) {
        ctx.performance.resources = await profiler.step('performance.resourceWaterfall', () => getResourceWaterfall());
      } else {
        profiler.skip('performance.resourceWaterfall');
      }
    }
  } else {
    profiler.skip('performance', { reason: 'module_disabled' });
  }

  // Network
  if (includeNetwork) {
    ctx.network = await profiler.step('network.passive', () => getNetworkInfo());
  } else {
    profiler.skip('network.passive', { reason: 'disabled' });
  }

  // Fingerprinting
  if (includeFingerprint) {
    const canvasHash = config.fingerprint.canvas
      ? await profiler.step('fingerprint.canvas', () => getCanvasFingerprintHash())
      : (profiler.skip('fingerprint.canvas', { reason: 'disabled_by_config' }), null);

    const fonts = config.fingerprint.fonts
      ? await profiler.step('fingerprint.fonts', () => detectFonts())
      : (profiler.skip('fingerprint.fonts', { reason: 'disabled_by_config' }), []);

    const webgl = config.fingerprint.webgl
      ? await profiler.step('fingerprint.webgl', () => getWebGLInfo())
      : (profiler.skip('fingerprint.webgl', { reason: 'disabled_by_config' }), null);

    ctx.fingerprint = { canvas: canvasHash, fonts, webgl };
  } else {
    profiler.skip('fingerprint.canvas', { reason: 'disabled' });
    profiler.skip('fingerprint.fonts', { reason: 'disabled' });
    profiler.skip('fingerprint.webgl', { reason: 'disabled' });
  }

  const profile = profiler.finish();

  if (options.consoleLog && typeof console !== 'undefined') {
    try {
      console.table(profile.steps.map((s) => ({ name: s.name, status: s.status, ms: Math.round(s.durationMs) })));
      console.log('[VisitorContext] total ms:', Math.round(profile.durationMs));
    } catch {
      // ignore
    }
  }

  return { ctx, profile };
}

/**
 * Main VisitorContext namespace
 *
 * Provides the primary API for collecting visitor context data.
 * This is an alias for backward compatibility.
 */
export const VisitorContext = {
  collect,
  collectProfiled,
};
