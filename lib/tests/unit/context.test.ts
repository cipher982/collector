/**
 * Unit tests for context.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getBrowserInfo, getDeviceInfo, getLocaleInfo, collectContext } from '../../src/collectors/context.js';

describe('context collectors', () => {
  describe('getBrowserInfo', () => {
    beforeEach(() => {
      // Set up navigator mock
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          language: 'en-US',
          languages: ['en-US', 'en', 'es'],
          platform: 'MacIntel',
          vendor: 'Google Inc.',
          cookieEnabled: true,
          doNotTrack: null,
          onLine: true,
        },
        writable: true,
        configurable: true,
      });
    });

    it('should collect basic browser info', () => {
      const info = getBrowserInfo();

      expect(info.userAgent).toContain('Mozilla');
      expect(info.language).toBe('en-US');
      expect(info.languages).toEqual(['en-US', 'en', 'es']);
      expect(info.platform).toBe('MacIntel');
      expect(info.vendor).toBe('Google Inc.');
      expect(info.cookieEnabled).toBe(true);
      expect(info.online).toBe(true);
    });

    it('should handle doNotTrack = "1"', () => {
      Object.defineProperty(global, 'navigator', {
        value: { ...global.navigator, doNotTrack: '1' },
        writable: true,
        configurable: true,
      });

      const info = getBrowserInfo();
      expect(info.doNotTrack).toBe(true);
    });

    it('should handle doNotTrack = "yes"', () => {
      Object.defineProperty(global, 'navigator', {
        value: { ...global.navigator, doNotTrack: 'yes' },
        writable: true,
        configurable: true,
      });

      const info = getBrowserInfo();
      expect(info.doNotTrack).toBe(true);
    });

    it('should handle doNotTrack = null as false', () => {
      const info = getBrowserInfo();
      expect(info.doNotTrack).toBe(false);
    });

    it('should handle offline state', () => {
      Object.defineProperty(global, 'navigator', {
        value: { ...global.navigator, onLine: false },
        writable: true,
        configurable: true,
      });

      const info = getBrowserInfo();
      expect(info.online).toBe(false);
    });
  });

  describe('getDeviceInfo', () => {
    beforeEach(() => {
      // Mock window and screen
      Object.defineProperty(global, 'window', {
        value: {
          innerWidth: 1920,
          innerHeight: 1080,
          devicePixelRatio: 2,
          screen: {
            width: 2560,
            height: 1440,
            colorDepth: 24,
            orientation: null,
          },
        },
        writable: true,
        configurable: true,
      });

      Object.defineProperty(global, 'navigator', {
        value: {
          hardwareConcurrency: 8,
          maxTouchPoints: 0,
        },
        writable: true,
        configurable: true,
      });
    });

    it('should collect device dimensions', () => {
      const info = getDeviceInfo();

      expect(info.screenWidth).toBe(2560);
      expect(info.screenHeight).toBe(1440);
      expect(info.viewportWidth).toBe(1920);
      expect(info.viewportHeight).toBe(1080);
    });

    it('should collect display properties', () => {
      const info = getDeviceInfo();

      expect(info.colorDepth).toBe(24);
      expect(info.pixelRatio).toBe(2);
    });

    it('should detect portrait orientation', () => {
      Object.defineProperty(global, 'window', {
        value: {
          ...global.window,
          screen: {
            width: 800,
            height: 1200,
            colorDepth: 24,
            orientation: null,
          },
        },
        writable: true,
        configurable: true,
      });

      const info = getDeviceInfo();
      expect(info.orientation).toBe('portrait');
    });

    it('should detect landscape orientation', () => {
      const info = getDeviceInfo();
      expect(info.orientation).toBe('landscape');
    });

    it('should use modern orientation API when available', () => {
      Object.defineProperty(global, 'window', {
        value: {
          ...global.window,
          screen: {
            width: 1920,
            height: 1080,
            colorDepth: 24,
            orientation: {
              type: 'portrait-primary',
            },
          },
        },
        writable: true,
        configurable: true,
      });

      const info = getDeviceInfo();
      expect(info.orientation).toBe('portrait');
    });

    it('should collect hardware info', () => {
      const info = getDeviceInfo();

      expect(info.hardwareConcurrency).toBe(8);
      expect(info.touchPoints).toBe(0);
    });

    it('should handle Chrome deviceMemory property', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          ...global.navigator,
          deviceMemory: 8,
        },
        writable: true,
        configurable: true,
      });

      const info = getDeviceInfo();
      expect(info.deviceMemory).toBe(8);
    });

    it('should return null for deviceMemory when not available', () => {
      const info = getDeviceInfo();
      expect(info.deviceMemory).toBeNull();
    });

    it('should handle touch devices', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          ...global.navigator,
          maxTouchPoints: 5,
        },
        writable: true,
        configurable: true,
      });

      const info = getDeviceInfo();
      expect(info.touchPoints).toBe(5);
    });
  });

  describe('getLocaleInfo', () => {
    beforeEach(() => {
      // Mock Intl.DateTimeFormat
      global.Intl = {
        DateTimeFormat: function () {
          return {
            resolvedOptions: () => ({ timeZone: 'America/New_York' }),
          };
        },
      } as any;

      Object.defineProperty(global, 'navigator', {
        value: {
          language: 'en-US',
        },
        writable: true,
        configurable: true,
      });
    });

    it('should collect timezone info', () => {
      const info = getLocaleInfo();

      expect(info.timezone).toBe('America/New_York');
      expect(typeof info.timezoneOffset).toBe('number');
      expect(info.locale).toBe('en-US');
    });

    it('should handle different locales', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          language: 'es-ES',
        },
        writable: true,
        configurable: true,
      });

      const info = getLocaleInfo();
      expect(info.locale).toBe('es-ES');
    });
  });

  describe('collectContext', () => {
    beforeEach(() => {
      // Set up complete mock environment
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0',
          language: 'en-US',
          languages: ['en-US', 'en'],
          platform: 'MacIntel',
          vendor: 'Google Inc.',
          cookieEnabled: true,
          doNotTrack: null,
          onLine: true,
          hardwareConcurrency: 8,
          maxTouchPoints: 0,
        },
        writable: true,
        configurable: true,
      });

      Object.defineProperty(global, 'window', {
        value: {
          innerWidth: 1920,
          innerHeight: 1080,
          devicePixelRatio: 2,
          screen: {
            width: 2560,
            height: 1440,
            colorDepth: 24,
            orientation: null,
          },
        },
        writable: true,
        configurable: true,
      });

      global.Intl = {
        DateTimeFormat: function () {
          return {
            resolvedOptions: () => ({ timeZone: 'America/Los_Angeles' }),
          };
        },
      } as any;
    });

    it('should collect all context data', () => {
      const context = collectContext();

      // Verify structure
      expect(context).toHaveProperty('browser');
      expect(context).toHaveProperty('device');
      expect(context).toHaveProperty('locale');

      // Verify browser
      expect(context.browser.userAgent).toContain('Mozilla');
      expect(context.browser.language).toBe('en-US');

      // Verify device
      expect(context.device.screenWidth).toBe(2560);
      expect(context.device.viewportWidth).toBe(1920);

      // Verify locale
      expect(context.locale.timezone).toBe('America/Los_Angeles');
    });

    it('should return consistent data structure', () => {
      const context = collectContext();

      // All required fields should be present
      expect(context.browser).toBeDefined();
      expect(context.device).toBeDefined();
      expect(context.locale).toBeDefined();

      // Check all browser fields
      expect(typeof context.browser.userAgent).toBe('string');
      expect(typeof context.browser.language).toBe('string');
      expect(Array.isArray(context.browser.languages)).toBe(true);
      expect(typeof context.browser.cookieEnabled).toBe('boolean');
      expect(typeof context.browser.online).toBe('boolean');

      // Check all device fields
      expect(typeof context.device.screenWidth).toBe('number');
      expect(typeof context.device.viewportWidth).toBe('number');
      expect(typeof context.device.pixelRatio).toBe('number');
      expect(['portrait', 'landscape']).toContain(context.device.orientation);

      // Check all locale fields
      expect(typeof context.locale.timezone).toBe('string');
      expect(typeof context.locale.timezoneOffset).toBe('number');
      expect(typeof context.locale.locale).toBe('string');
    });
  });
});
