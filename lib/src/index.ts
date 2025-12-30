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

// Utilities
export {
  storage,
  getStorageItem,
  setStorageItem,
  removeStorageItem,
} from './utils/storage.js';
