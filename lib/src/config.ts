/**
 * Configuration system for Visitor Context Library
 *
 * Provides default configuration and merge functionality.
 */

import type { LibraryConfig } from './types.js';

/**
 * Default library configuration
 *
 * - Most modules enabled by default
 * - Fingerprinting disabled (privacy-first)
 * - Battery/GPU disabled (deprecated/experimental)
 * - Auto-emit disabled (manual control by default)
 */
export const defaultConfig: LibraryConfig = {
  // Endpoints (undefined by default, user must provide)
  collectEndpoint: undefined,
  eventEndpoint: undefined,

  // Module toggles
  modules: {
    context: true, // Browser/device info
    performance: true, // Web Vitals, timing
    network: true, // Network info
    fingerprint: false, // Disabled by default (privacy)
    battery: false, // Deprecated API
    gpu: false, // Experimental
  },

  // Fingerprint options (if enabled)
  fingerprint: {
    canvas: true,
    fonts: true,
    webgl: true,
  },

  // Performance options
  performance: {
    webVitals: true,
    navigationTiming: true,
    resourceWaterfall: false, // Can be large
  },

  // Identity options
  identity: {
    persist: true, // Use localStorage
    visitorIdKey: 'collector.visitor_id', // Match existing script.js
    sessionIdKey: 'collector.session_id', // Match existing script.js
  },

  // Event emission
  autoEmit: false, // Manual control by default
  batchEvents: true,
  batchInterval: 5000, // 5 seconds
};

/**
 * Current active configuration
 */
let activeConfig: LibraryConfig = { ...defaultConfig };

/**
 * Deep merge two objects
 *
 * @param target - Target object
 * @param source - Source object to merge from
 * @returns Merged object
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        // Recursively merge objects
        result[key] = deepMerge(targetValue, sourceValue);
      } else if (sourceValue !== undefined) {
        // Overwrite with source value
        result[key] = sourceValue as any;
      }
    }
  }

  return result;
}

/**
 * Configure the library
 *
 * Merges provided configuration with defaults. Can be called multiple times
 * to update configuration incrementally.
 *
 * @param config - Partial configuration to merge
 * @returns Complete active configuration
 *
 * @example
 * ```typescript
 * import { configure } from '@collector/context';
 *
 * configure({
 *   modules: {
 *     fingerprint: true, // Enable fingerprinting
 *   },
 *   collectEndpoint: '/collect',
 * });
 * ```
 */
export function configure(config: Partial<LibraryConfig>): LibraryConfig {
  activeConfig = deepMerge(activeConfig, config);
  return activeConfig;
}

/**
 * Get current active configuration
 *
 * @returns Current configuration
 */
export function getConfig(): Readonly<LibraryConfig> {
  return activeConfig;
}

/**
 * Reset configuration to defaults
 *
 * Useful for testing or clearing custom configuration.
 */
export function resetConfig(): LibraryConfig {
  activeConfig = { ...defaultConfig };
  return activeConfig;
}
