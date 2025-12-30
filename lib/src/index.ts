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
  VisitorContext,
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
import type { VisitorContext } from './types.js';
import { getConfig } from './config.js';
import { collectIdentity } from './core/identity.js';
import { collectContext } from './collectors/context.js';
import { collectPerformance } from './collectors/performance.js';
import { collectNetworkInfo } from './collectors/network.js';
import { collectFingerprint } from './collectors/fingerprint.js';

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
 * import { VisitorContext } from '@collector/context';
 *
 * const ctx = await VisitorContext.collect();
 * console.log(ctx.browser.userAgent);
 * console.log(ctx.identity.visitorId);
 * ```
 */
export async function collect(): Promise<VisitorContext> {
  const config = getConfig();

  // Always collect identity and context (required)
  const identity = collectIdentity(config.identity);
  const contextData = collectContext();

  // Build base context
  const result: VisitorContext = {
    identity,
    browser: contextData.browser,
    device: contextData.device,
    locale: contextData.locale,
  };

  // Collect optional modules based on configuration
  if (config.modules.performance) {
    result.performance = await collectPerformance();
  }

  if (config.modules.network) {
    result.network = await collectNetworkInfo();
  }

  if (config.modules.fingerprint) {
    result.fingerprint = await collectFingerprint();
  }

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
 * Main VisitorContext namespace
 *
 * Provides the primary API for collecting visitor context data.
 */
export const VisitorContext = {
  collect,
};
