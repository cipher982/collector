/**
 * Type definitions for Visitor Context Library
 */

/**
 * Core identity information for tracking visitors across sessions
 */
export interface IdentityData {
  /** Persistent across sessions (localStorage) */
  visitorId: string;
  /** Per browser session (sessionStorage) */
  sessionId: string;
  /** Per page load (generated each time) */
  pageviewId: string;
}

/**
 * Browser information
 */
export interface BrowserInfo {
  userAgent: string;
  language: string;
  languages: string[];
  platform: string;
  vendor: string;
  cookieEnabled: boolean;
  doNotTrack: boolean;
  online: boolean;
}

/**
 * Device hardware information
 */
export interface DeviceInfo {
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  colorDepth: number;
  pixelRatio: number;
  orientation: 'portrait' | 'landscape';
  /** GB, Chrome only */
  deviceMemory: number | null;
  /** CPU cores */
  hardwareConcurrency: number;
  touchPoints: number;
}

/**
 * Locale and timezone information
 */
export interface LocaleInfo {
  /** IANA timezone */
  timezone: string;
  /** Minutes from UTC */
  timezoneOffset: number;
  /** navigator.language */
  locale: string;
}

/**
 * Web Vitals performance metrics
 */
export interface WebVitals {
  /** Largest Contentful Paint (ms) */
  lcp: number | null;
  /** First Contentful Paint (ms) */
  fcp: number | null;
  /** First Input Delay (ms) */
  fid: number | null;
  /** Cumulative Layout Shift (score) */
  cls: number | null;
  /** Time to First Byte (ms) */
  ttfb: number | null;
}

/**
 * Collection profiling metadata
 */
export type ProfileStatus = 'ok' | 'error' | 'skipped';

export interface ProfileStep {
  name: string;
  status: ProfileStatus;
  startMs: number;
  endMs: number;
  durationMs: number;
  errorMessage?: string;
  meta?: Record<string, any>;
}

export interface CollectionProfile {
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  steps: ProfileStep[];
}

/**
 * Navigation timing metrics
 */
export interface TimingData {
  dnsLookup: number;
  tcpConnect: number;
  ttfb: number;
  domReady: number;
  loadComplete: number;
}

/**
 * Resource waterfall entry
 */
export interface ResourceEntry {
  name: string;
  type: string;
  duration: number;
  size?: number;
}

/**
 * Complete performance data
 */
export interface PerformanceData {
  webVitals: WebVitals;
  timing: TimingData;
  resources?: ResourceEntry[];
}

/**
 * Network connection information
 */
export interface NetworkData {
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | null;
  /** Mbps */
  downlink: number | null;
  /** Round-trip time (ms) */
  rtt: number | null;
  saveData: boolean;
  /** Active measurements (if endpoints provided). Null if measurement failed. */
  latencyMs?: number | null;
  bandwidthMbps?: number | null;
}

/**
 * WebGL rendering information
 */
export interface WebGLInfo {
  vendor: string | null;
  renderer: string | null;
  version: string | null;
  shadingLanguage: string | null;
  extensions: string[];
}

/**
 * Browser fingerprinting data
 */
export interface FingerprintData {
  /** Hash of canvas rendering */
  canvas: string | null;
  /** Detected fonts */
  fonts: string[];
  /** WebGL renderer info */
  webgl: WebGLInfo | null;
}

/**
 * Battery status (deprecated API)
 */
export interface BatteryData {
  /** 0-100 */
  level: number;
  charging: boolean;
}

/**
 * GPU benchmark results
 */
export interface GpuData {
  baselineFps: {
    min: number;
    max: number;
    avg: number;
    stdDev: number;
  };
  /** GPU timer in ms */
  timerQuery: number | null;
  /** Supported compression formats */
  textureSupport: string[];
}

/**
 * Complete visitor context data
 */
export interface VisitorContext {
  identity: IdentityData;
  browser: BrowserInfo;
  device: DeviceInfo;
  locale: LocaleInfo;
  /** Optional modules (null if disabled) */
  performance?: PerformanceData;
  network?: NetworkData;
  fingerprint?: FingerprintData;
  battery?: BatteryData;
  gpu?: GpuData;
}

/**
 * Configuration for individual modules
 */
export interface ModuleConfig {
  /** Browser/device info */
  context: boolean;
  /** Web Vitals, timing */
  performance: boolean;
  /** Network info */
  network: boolean;
  /** Disabled by default (privacy) */
  fingerprint: boolean;
  /** Deprecated API */
  battery: boolean;
  /** Experimental */
  gpu: boolean;
}

/**
 * Fingerprint collection options
 */
export interface FingerprintConfig {
  canvas: boolean;
  fonts: boolean;
  webgl: boolean;
}

/**
 * Performance collection options
 */
export interface PerformanceConfig {
  webVitals: boolean;
  /**
   * How long to wait for web vitals observers to settle (ms).
   *
   * Notes:
   * - Web-vitals can take seconds (or require user input) to fully stabilize.
   * - For "fast first response" use cases, set this to a low number (e.g. 150–300ms)
   *   or disable `webVitals` entirely.
   */
  webVitalsTimeoutMs?: number;
  navigationTiming: boolean;
  /** Can be large */
  resourceWaterfall: boolean;
}

/**
 * Identity persistence options
 */
export interface IdentityConfig {
  /** Use localStorage */
  persist: boolean;
  /** Storage key for visitor ID */
  visitorIdKey: string;
  /** Storage key for session ID */
  sessionIdKey: string;
}

/**
 * Complete library configuration
 */
export interface LibraryConfig {
  /** Endpoints for auto-emit */
  collectEndpoint?: string;
  eventEndpoint?: string;

  /** Module toggles */
  modules: ModuleConfig;

  /** Fingerprint options */
  fingerprint: FingerprintConfig;

  /** Performance options */
  performance: PerformanceConfig;

  /** Identity options */
  identity: IdentityConfig;

  /** Event emission */
  autoEmit: boolean;
  batchEvents: boolean;
  batchInterval: number;
}
