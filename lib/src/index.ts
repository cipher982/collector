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
