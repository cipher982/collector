/**
 * Unit tests for network.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getNetworkInfo, measureLatency, measureBandwidth, collectNetworkInfo } from '../../src/collectors/network.js';

describe('network collectors', () => {
  describe('getNetworkInfo', () => {
    beforeEach(() => {
      // Clean up any existing mocks
      vi.clearAllMocks();
    });

    it('should collect network info when connection API is available', () => {
      const mockConnection = {
        effectiveType: '4g' as const,
        downlink: 10,
        rtt: 50,
        saveData: false,
      };

      Object.defineProperty(global, 'navigator', {
        value: {
          connection: mockConnection,
        },
        writable: true,
        configurable: true,
      });

      const network = getNetworkInfo();

      expect(network.effectiveType).toBe('4g');
      expect(network.downlink).toBe(10);
      expect(network.rtt).toBe(50);
      expect(network.saveData).toBe(false);
    });

    it('should handle missing connection API', () => {
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });

      const network = getNetworkInfo();

      expect(network.effectiveType).toBeNull();
      expect(network.downlink).toBeNull();
      expect(network.rtt).toBeNull();
      expect(network.saveData).toBe(false);
    });

    it('should handle partial connection data', () => {
      const mockConnection = {
        effectiveType: '3g' as const,
        saveData: true,
        // downlink and rtt missing
      };

      Object.defineProperty(global, 'navigator', {
        value: {
          connection: mockConnection,
        },
        writable: true,
        configurable: true,
      });

      const network = getNetworkInfo();

      expect(network.effectiveType).toBe('3g');
      expect(network.downlink).toBeNull();
      expect(network.rtt).toBeNull();
      expect(network.saveData).toBe(true);
    });

    it('should handle vendor-prefixed connection API', () => {
      const mockConnection = {
        effectiveType: '2g' as const,
        downlink: 1.5,
        rtt: 200,
        saveData: false,
      };

      Object.defineProperty(global, 'navigator', {
        value: {
          mozConnection: mockConnection,
        },
        writable: true,
        configurable: true,
      });

      const network = getNetworkInfo();

      expect(network.effectiveType).toBe('2g');
      expect(network.downlink).toBe(1.5);
      expect(network.rtt).toBe(200);
    });

    it('should handle slow-2g connection type', () => {
      const mockConnection = {
        effectiveType: 'slow-2g' as const,
        downlink: 0.5,
        rtt: 500,
        saveData: true,
      };

      Object.defineProperty(global, 'navigator', {
        value: {
          connection: mockConnection,
        },
        writable: true,
        configurable: true,
      });

      const network = getNetworkInfo();

      expect(network.effectiveType).toBe('slow-2g');
      expect(network.saveData).toBe(true);
    });
  });

  describe('measureLatency', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should measure latency successfully', async () => {
      // Mock performance.now() to simulate 42ms elapsed
      let callCount = 0;
      vi.spyOn(global.performance, 'now').mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 0 : 42; // First call: 0, second call: 42
      });

      // Mock fetch to succeed
      global.fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: true,
        });
      });

      const latency = await measureLatency('/ping');

      expect(latency).toBe(42);
      expect(global.fetch).toHaveBeenCalledWith('/ping', expect.objectContaining({ method: 'HEAD' }));
    });

    it('should return null on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const latency = await measureLatency('/ping');

      expect(latency).toBeNull();
    });

    it('should return null on non-ok response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const latency = await measureLatency('/ping');

      expect(latency).toBeNull();
    });

    it('should timeout if request takes too long', async () => {
      // Mock fetch that never resolves in time
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((resolve, reject) => {
          // Simulate abort controller timeout
          const signal = options?.signal as AbortSignal;
          if (signal) {
            signal.addEventListener('abort', () => {
              reject(new Error('AbortError'));
            });
          }
        });
      });

      const latency = await measureLatency('/ping', 100);

      expect(latency).toBeNull();
    });

    it('should use custom endpoint', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      await measureLatency('/api/custom-ping');

      expect(global.fetch).toHaveBeenCalledWith('/api/custom-ping', expect.any(Object));
    });
  });

  describe('measureBandwidth', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should measure bandwidth from Content-Length', async () => {
      // Mock performance.now() - 100ms elapsed
      let callCount = 0;
      vi.spyOn(global.performance, 'now').mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 0 : 100; // 100ms elapsed
      });


      // 1 MB download in 100ms = 80 Mbps
      const mockResponse = {
        ok: true,
        headers: {
          get: (name: string) => (name === 'Content-Length' ? '1000000' : null),
        },
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const bandwidth = await measureBandwidth('/speedtest');

      expect(bandwidth).toBe(80); // 1MB in 0.1s = 80 Mbps
    });

    it('should measure bandwidth from blob size if no Content-Length', async () => {
      // Mock performance.now() - 100ms elapsed
      let callCount = 0;
      vi.spyOn(global.performance, 'now').mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 0 : 100; // 100ms elapsed
      });

      const mockBlob = { size: 500000 }; // 500 KB
      const mockResponse = {
        ok: true,
        headers: {
          get: () => null, // No Content-Length
        },
        blob: () => Promise.resolve(mockBlob),
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const bandwidth = await measureBandwidth('/speedtest');

      // 500KB in 100ms = 40 Mbps
      expect(bandwidth).toBe(40);
    });

    it('should return null on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const bandwidth = await measureBandwidth('/speedtest');

      expect(bandwidth).toBeNull();
    });

    it('should return null on non-ok response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const bandwidth = await measureBandwidth('/speedtest');

      expect(bandwidth).toBeNull();
    });

    it('should timeout if download takes too long', async () => {
      // Mock fetch that never resolves in time
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((resolve, reject) => {
          // Simulate abort controller timeout
          const signal = options?.signal as AbortSignal;
          if (signal) {
            signal.addEventListener('abort', () => {
              reject(new Error('AbortError'));
            });
          }
        });
      });

      const bandwidth = await measureBandwidth('/speedtest', 100);

      expect(bandwidth).toBeNull();
    });

    it('should round bandwidth to 2 decimals', async () => {
      // Mock performance.now() - 100ms elapsed
      let callCount = 0;
      vi.spyOn(global.performance, 'now').mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 0 : 100; // 100ms elapsed
      });

      // Test with a value that would have many decimals
      const mockResponse = {
        ok: true,
        headers: {
          get: (name: string) => (name === 'Content-Length' ? '333333' : null),
        },
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const bandwidth = await measureBandwidth('/speedtest');

      // Should be rounded to 2 decimals
      expect(bandwidth).toBeCloseTo(26.67, 2);
    });
  });

  describe('collectNetworkInfo', () => {
    beforeEach(() => {
      vi.clearAllMocks();

      // Mock navigator.connection
      Object.defineProperty(global, 'navigator', {
        value: {
          connection: {
            effectiveType: '4g' as const,
            downlink: 10,
            rtt: 50,
            saveData: false,
          },
        },
        writable: true,
        configurable: true,
      });
    });

    it('should return only base info when no endpoints provided', async () => {
      const network = await collectNetworkInfo();

      expect(network.effectiveType).toBe('4g');
      expect(network.downlink).toBe(10);
      expect(network.rtt).toBe(50);
      expect(network.saveData).toBe(false);
      expect(network.latencyMs).toBeUndefined();
      expect(network.bandwidthMbps).toBeUndefined();
    });

    it('should include latency when endpoint provided', async () => {
      // Mock performance.now() for latency
      let callCount = 0;
      vi.spyOn(global.performance, 'now').mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 0 : 50; // 50ms latency
      });

      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      const network = await collectNetworkInfo({
        latencyEndpoint: '/ping',
      });

      expect(network.effectiveType).toBe('4g');
      expect(network.latencyMs).toBe(50);
      expect(network.bandwidthMbps).toBeUndefined();
    });

    it('should include bandwidth when endpoint provided', async () => {
      // Mock performance.now() for bandwidth
      let callCount = 0;
      vi.spyOn(global.performance, 'now').mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 0 : 100; // 100ms elapsed
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name === 'Content-Length' ? '1000000' : null),
        },
      });

      const network = await collectNetworkInfo({
        bandwidthEndpoint: '/speedtest',
      });

      expect(network.effectiveType).toBe('4g');
      expect(network.latencyMs).toBeUndefined();
      expect(network.bandwidthMbps).toBeDefined();
    });

    it('should include both active measurements when both endpoints provided', async () => {
      // Mock performance.now() for both measurements
      let callCount = 0;
      vi.spyOn(global.performance, 'now').mockImplementation(() => {
        callCount++;
        // Alternates: 0, 50, 0, 100 (for latency and bandwidth)
        return callCount % 2 === 1 ? 0 : (callCount === 2 ? 50 : 100);
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name === 'Content-Length' ? '500000' : null),
        },
      });

      const network = await collectNetworkInfo({
        latencyEndpoint: '/ping',
        bandwidthEndpoint: '/speedtest',
      });

      expect(network.effectiveType).toBe('4g');
      expect(network.latencyMs).toBeDefined();
      expect(network.bandwidthMbps).toBeDefined();
    });

    it('should handle failed measurements gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const network = await collectNetworkInfo({
        latencyEndpoint: '/ping',
        bandwidthEndpoint: '/speedtest',
      });

      expect(network.effectiveType).toBe('4g');
      expect(network.latencyMs).toBeNull();
      expect(network.bandwidthMbps).toBeNull();
    });

    it('should pass custom timeout to measurements', async () => {
      // Mock fetch that never resolves in time
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((resolve, reject) => {
          // Simulate abort controller timeout
          const signal = options?.signal as AbortSignal;
          if (signal) {
            signal.addEventListener('abort', () => {
              reject(new Error('AbortError'));
            });
          }
        });
      });

      // Verify timeout was respected (measurement should fail)
      const network = await collectNetworkInfo({
        latencyEndpoint: '/ping',
        timeout: 100,
      });

      expect(network.latencyMs).toBeNull();
    });
  });
});
