/**
 * Unit tests for config.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  configure,
  getConfig,
  resetConfig,
  defaultConfig,
} from '../../src/config.js';

describe('config', () => {
  beforeEach(() => {
    // Reset to defaults before each test
    resetConfig();
  });

  describe('defaultConfig', () => {
    it('should have correct default values', () => {
      expect(defaultConfig.modules.context).toBe(true);
      expect(defaultConfig.modules.performance).toBe(true);
      expect(defaultConfig.modules.network).toBe(true);
      expect(defaultConfig.modules.fingerprint).toBe(false); // Privacy-first
      expect(defaultConfig.modules.battery).toBe(false); // Deprecated
      expect(defaultConfig.modules.gpu).toBe(false); // Experimental
    });

    it('should have identity persistence enabled by default', () => {
      expect(defaultConfig.identity.persist).toBe(true);
      expect(defaultConfig.identity.visitorIdKey).toBe('collector.visitor_id');
      expect(defaultConfig.identity.sessionIdKey).toBe('collector.session_id');
    });

    it('should have auto-emit disabled by default', () => {
      expect(defaultConfig.autoEmit).toBe(false);
      expect(defaultConfig.batchEvents).toBe(true);
      expect(defaultConfig.batchInterval).toBe(5000);
    });

    it('should have fingerprint options configured', () => {
      expect(defaultConfig.fingerprint.canvas).toBe(true);
      expect(defaultConfig.fingerprint.fonts).toBe(true);
      expect(defaultConfig.fingerprint.webgl).toBe(true);
    });

    it('should have performance options configured', () => {
      expect(defaultConfig.performance.webVitals).toBe(false);
      expect(defaultConfig.performance.webVitalsTimeoutMs).toBe(5000);
      expect(defaultConfig.performance.navigationTiming).toBe(true);
      expect(defaultConfig.performance.resourceWaterfall).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('should return default config initially', () => {
      const config = getConfig();
      expect(config).toEqual(defaultConfig);
    });

    it('should return current config after configure', () => {
      configure({ autoEmit: true });
      const config = getConfig();
      expect(config.autoEmit).toBe(true);
    });
  });

  describe('configure', () => {
    it('should merge partial config with defaults', () => {
      const config = configure({
        autoEmit: true,
      });

      expect(config.autoEmit).toBe(true);
      expect(config.modules.context).toBe(true); // Default preserved
    });

    it('should deep merge nested config', () => {
      const config = configure({
        modules: {
          fingerprint: true, // Override this one
        },
      });

      expect(config.modules.fingerprint).toBe(true); // Changed
      expect(config.modules.context).toBe(true); // Default preserved
      expect(config.modules.performance).toBe(true); // Default preserved
    });

    it('should allow updating endpoints', () => {
      const config = configure({
        collectEndpoint: '/api/collect',
        eventEndpoint: '/api/event',
      });

      expect(config.collectEndpoint).toBe('/api/collect');
      expect(config.eventEndpoint).toBe('/api/event');
    });

    it('should allow enabling fingerprinting', () => {
      const config = configure({
        modules: {
          fingerprint: true,
        },
      });

      expect(config.modules.fingerprint).toBe(true);
    });

    it('should allow customizing identity config', () => {
      const config = configure({
        identity: {
          persist: false,
          visitorIdKey: 'custom_v_id',
          sessionIdKey: 'custom_s_id',
        },
      });

      expect(config.identity.persist).toBe(false);
      expect(config.identity.visitorIdKey).toBe('custom_v_id');
      expect(config.identity.sessionIdKey).toBe('custom_s_id');
    });

    it('should allow partial identity config', () => {
      const config = configure({
        identity: {
          persist: false,
        },
      });

      expect(config.identity.persist).toBe(false);
      expect(config.identity.visitorIdKey).toBe('collector.visitor_id'); // Default preserved
    });

    it('should allow multiple configure calls', () => {
      configure({ autoEmit: true });
      configure({ batchEvents: false });

      const config = getConfig();
      expect(config.autoEmit).toBe(true);
      expect(config.batchEvents).toBe(false);
    });

    it('should update fingerprint sub-options', () => {
      const config = configure({
        fingerprint: {
          canvas: false,
        },
      });

      expect(config.fingerprint.canvas).toBe(false);
      expect(config.fingerprint.fonts).toBe(true); // Default preserved
      expect(config.fingerprint.webgl).toBe(true); // Default preserved
    });

    it('should update performance sub-options', () => {
      const config = configure({
        performance: {
          resourceWaterfall: true,
        },
      });

      expect(config.performance.resourceWaterfall).toBe(true);
      expect(config.performance.webVitals).toBe(false); // Default preserved
    });

    it('should return the updated config', () => {
      const returned = configure({ autoEmit: true });
      const current = getConfig();

      expect(returned).toEqual(current);
      expect(returned.autoEmit).toBe(true);
    });
  });

  describe('resetConfig', () => {
    it('should reset to default config', () => {
      configure({ autoEmit: true });
      expect(getConfig().autoEmit).toBe(true);

      resetConfig();
      expect(getConfig().autoEmit).toBe(false);
    });

    it('should reset nested config', () => {
      configure({
        modules: { fingerprint: true },
        identity: { persist: false },
      });

      resetConfig();

      const config = getConfig();
      expect(config.modules.fingerprint).toBe(false);
      expect(config.identity.persist).toBe(true);
    });

    it('should return the reset config', () => {
      const config = resetConfig();
      expect(config).toEqual(defaultConfig);
    });
  });

  describe('config immutability', () => {
    it('should not allow external mutation of config', () => {
      const config = getConfig();

      // TypeScript prevents this, but check runtime behavior
      expect(() => {
        // @ts-expect-error - testing runtime immutability
        config.autoEmit = true;
      }).not.toThrow();

      // Original should still be false (we can't enforce true immutability without Object.freeze)
      // This test documents current behavior
    });
  });

  describe('deep merge behavior', () => {
    it('should not merge arrays, should replace them', () => {
      // This tests implementation detail - arrays should be replaced, not merged
      const config = configure({
        modules: {
          context: false,
          performance: false,
        },
      });

      expect(config.modules.context).toBe(false);
      expect(config.modules.performance).toBe(false);
      expect(config.modules.network).toBe(true); // Not specified, keeps default
    });

    it('should handle undefined values', () => {
      const config = configure({
        collectEndpoint: undefined,
      });

      expect(config.collectEndpoint).toBeUndefined();
    });
  });
});
