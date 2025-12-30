/**
 * Unit tests for performance.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getNavigationTiming,
  getResourceWaterfall,
  getWebVitals,
  collectPerformance,
} from '../../src/collectors/performance.js';

describe('performance collectors', () => {
  describe('getNavigationTiming', () => {
    beforeEach(() => {
      // Mock modern PerformanceNavigationTiming API
      const mockNavEntry = {
        entryType: 'navigation',
        domainLookupStart: 100,
        domainLookupEnd: 120,
        connectStart: 120,
        connectEnd: 150,
        requestStart: 150,
        responseStart: 200,
        fetchStart: 50,
        domContentLoadedEventEnd: 500,
        loadEventEnd: 800,
      };

      Object.defineProperty(global, 'performance', {
        value: {
          getEntriesByType: (type: string) => {
            if (type === 'navigation') {
              return [mockNavEntry];
            }
            return [];
          },
        },
        writable: true,
        configurable: true,
      });
    });

    it('should collect navigation timing from modern API', () => {
      const timing = getNavigationTiming();

      expect(timing.dnsLookup).toBe(20); // 120 - 100
      expect(timing.tcpConnect).toBe(30); // 150 - 120
      expect(timing.ttfb).toBe(50); // 200 - 150
      expect(timing.domReady).toBe(450); // 500 - 50
      expect(timing.loadComplete).toBe(750); // 800 - 50
    });

    it('should fallback to deprecated timing API', () => {
      const mockTiming = {
        navigationStart: 1000,
        domainLookupStart: 1100,
        domainLookupEnd: 1120,
        connectStart: 1120,
        connectEnd: 1150,
        requestStart: 1150,
        responseStart: 1200,
        domContentLoadedEventEnd: 1500,
        loadEventEnd: 1800,
      };

      Object.defineProperty(global, 'performance', {
        value: {
          getEntriesByType: () => [], // No modern entries
          timing: mockTiming,
        },
        writable: true,
        configurable: true,
      });

      const timing = getNavigationTiming();

      expect(timing.dnsLookup).toBe(20);
      expect(timing.tcpConnect).toBe(30);
      expect(timing.ttfb).toBe(50);
      expect(timing.domReady).toBe(500);
      expect(timing.loadComplete).toBe(800);
    });
  });

  describe('getResourceWaterfall', () => {
    beforeEach(() => {
      const mockResources = [
        {
          name: 'https://example.com/script.js',
          initiatorType: 'script',
          duration: 123.45,
          transferSize: 5000,
        },
        {
          name: 'https://example.com/style.css',
          initiatorType: 'css',
          duration: 89.12,
          transferSize: 3000,
        },
        {
          name: 'https://example.com/image.png',
          initiatorType: 'img',
          duration: 200.5,
          transferSize: 0, // cached
        },
      ];

      Object.defineProperty(global, 'performance', {
        value: {
          getEntriesByType: (type: string) => {
            if (type === 'resource') {
              return mockResources;
            }
            return [];
          },
        },
        writable: true,
        configurable: true,
      });
    });

    it('should collect resource entries', () => {
      const resources = getResourceWaterfall();

      expect(resources).toHaveLength(3);
      expect(resources[0].name).toBe('https://example.com/script.js');
      expect(resources[0].type).toBe('script');
      expect(resources[0].duration).toBe(123);
    });

    it('should round durations', () => {
      const resources = getResourceWaterfall();

      expect(resources[0].duration).toBe(123); // 123.45 rounded
      expect(resources[1].duration).toBe(89); // 89.12 rounded
      expect(resources[2].duration).toBe(201); // 200.5 rounded
    });

    it('should include transfer sizes', () => {
      const resources = getResourceWaterfall();

      expect(resources[0].size).toBe(5000);
      expect(resources[1].size).toBe(3000);
      expect(resources[2].size).toBeUndefined(); // 0 becomes undefined
    });
  });

  describe('getWebVitals', () => {
    it('should return promise with web vitals structure', async () => {
      // Mock basic performance API
      Object.defineProperty(global, 'PerformanceObserver', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const vitals = await getWebVitals(10);

      expect(vitals).toHaveProperty('lcp');
      expect(vitals).toHaveProperty('fcp');
      expect(vitals).toHaveProperty('fid');
      expect(vitals).toHaveProperty('cls');
      expect(vitals).toHaveProperty('ttfb');
    });

    it('should timeout after specified duration', async () => {
      Object.defineProperty(global, 'PerformanceObserver', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const start = Date.now();
      const vitals = await getWebVitals(50);
      const elapsed = Date.now() - start;

      // Should complete quickly when no observer available
      expect(elapsed).toBeLessThan(100);
      expect(vitals.lcp).toBeNull();
      expect(vitals.fcp).toBeNull();
    });
  });

  describe('collectPerformance', () => {
    beforeEach(() => {
      // Mock basic performance API
      const mockNavEntry = {
        entryType: 'navigation',
        domainLookupStart: 100,
        domainLookupEnd: 120,
        connectStart: 120,
        connectEnd: 150,
        requestStart: 150,
        responseStart: 200,
        fetchStart: 50,
        domContentLoadedEventEnd: 500,
        loadEventEnd: 800,
      };

      Object.defineProperty(global, 'performance', {
        value: {
          getEntriesByType: (type: string) => {
            if (type === 'navigation') {
              return [mockNavEntry];
            }
            if (type === 'resource') {
              return [
                {
                  name: 'test.js',
                  initiatorType: 'script',
                  duration: 100,
                  transferSize: 5000,
                },
              ];
            }
            return [];
          },
        },
        writable: true,
        configurable: true,
      });

      // Disable PerformanceObserver for sync tests
      Object.defineProperty(global, 'PerformanceObserver', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    });

    it('should collect complete performance data', async () => {
      const data = await collectPerformance({ webVitalsTimeout: 10 });

      expect(data).toHaveProperty('webVitals');
      expect(data).toHaveProperty('timing');
      expect(data.timing.dnsLookup).toBe(20);
      expect(data.timing.tcpConnect).toBe(30);
    });

    it('should exclude resources by default', async () => {
      const data = await collectPerformance({ webVitalsTimeout: 10 });

      expect(data.resources).toBeUndefined();
    });

    it('should include resources when requested', async () => {
      const data = await collectPerformance({
        includeResources: true,
        webVitalsTimeout: 10,
      });

      expect(data.resources).toBeDefined();
      expect(data.resources).toHaveLength(1);
      expect(data.resources![0].name).toBe('test.js');
    });

    it('should use timeout for web vitals', async () => {
      const start = Date.now();
      await collectPerformance({ webVitalsTimeout: 10 });
      const elapsed = Date.now() - start;

      // Should complete quickly
      expect(elapsed).toBeLessThan(100);
    });
  });
});
