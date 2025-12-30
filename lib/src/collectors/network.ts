/**
 * Network information collector
 *
 * Collects network connection information from the Network Information API
 * and optionally performs active measurements (latency, bandwidth).
 */

import type { NetworkData } from '../types.js';

/**
 * Extended NetworkInformation interface
 * (not all browsers support all properties)
 */
interface NetworkInformation {
  effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

/**
 * Get network connection information from navigator.connection
 *
 * Returns basic network info from the Network Information API.
 * All fields may be null if the API is not supported or permissions are denied.
 *
 * @returns Basic network information
 *
 * @example
 * ```typescript
 * const network = getNetworkInfo();
 * console.log(network.effectiveType); // '4g', '3g', etc.
 * console.log(network.downlink); // 10 (Mbps)
 * ```
 */
export function getNetworkInfo(): NetworkData {
  const nav = navigator as any;
  const connection: NetworkInformation | undefined = nav.connection || nav.mozConnection || nav.webkitConnection;

  if (!connection) {
    return {
      effectiveType: null,
      downlink: null,
      rtt: null,
      saveData: false,
    };
  }

  return {
    effectiveType: connection.effectiveType ?? null,
    downlink: connection.downlink ?? null,
    rtt: connection.rtt ?? null,
    saveData: connection.saveData ?? false,
  };
}

/**
 * Measure active latency by pinging an endpoint
 *
 * Sends a lightweight HEAD request to measure round-trip time.
 * Uses the provided endpoint or defaults to the current origin.
 *
 * @param endpoint - URL to ping (defaults to '/ping' or current origin)
 * @param timeout - Maximum time to wait for response (ms)
 * @returns Latency in milliseconds, or null on failure
 *
 * @example
 * ```typescript
 * const latency = await measureLatency('/api/ping');
 * console.log(latency); // 42 (ms)
 * ```
 */
export async function measureLatency(
  endpoint: string = '/ping',
  timeout: number = 5000
): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const start = performance.now();
    const response = await fetch(endpoint, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });
    const end = performance.now();

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    return Math.round(end - start);
  } catch (error) {
    // Timeout, network error, or aborted
    return null;
  }
}

/**
 * Measure active bandwidth by downloading test data
 *
 * Downloads a small resource and calculates bandwidth based on time taken.
 * This is an approximation and may not reflect peak bandwidth.
 *
 * @param endpoint - URL to download test data from
 * @param timeout - Maximum time to wait (ms)
 * @returns Bandwidth in Mbps, or null on failure
 *
 * @example
 * ```typescript
 * const bandwidth = await measureBandwidth('/api/speedtest');
 * console.log(bandwidth); // 15.3 (Mbps)
 * ```
 */
export async function measureBandwidth(
  endpoint: string,
  timeout: number = 10000
): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const start = performance.now();
    const response = await fetch(endpoint, {
      signal: controller.signal,
      cache: 'no-store',
    });
    const end = performance.now();

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    // Get response size from Content-Length or actual blob size
    const contentLength = response.headers.get('Content-Length');
    let bytes = 0;

    if (contentLength) {
      bytes = parseInt(contentLength, 10);
    } else {
      // Fall back to reading the response
      const blob = await response.blob();
      bytes = blob.size;
    }

    const durationSeconds = (end - start) / 1000;
    const bitsPerSecond = (bytes * 8) / durationSeconds;
    const mbps = bitsPerSecond / 1_000_000;

    return Math.round(mbps * 100) / 100; // Round to 2 decimals
  } catch (error) {
    // Timeout, network error, or aborted
    return null;
  }
}

/**
 * Collect complete network information including optional active measurements
 *
 * Combines passive network info from the API with optional active measurements.
 * Active measurements only run if endpoints are provided.
 *
 * @param options - Configuration for active measurements
 * @returns Complete network data
 *
 * @example
 * ```typescript
 * // Basic network info only
 * const network = await collectNetworkInfo();
 *
 * // With active measurements
 * const network = await collectNetworkInfo({
 *   latencyEndpoint: '/api/ping',
 *   bandwidthEndpoint: '/api/speedtest',
 * });
 * ```
 */
export async function collectNetworkInfo(options?: {
  latencyEndpoint?: string;
  bandwidthEndpoint?: string;
  timeout?: number;
}): Promise<NetworkData> {
  const baseInfo = getNetworkInfo();

  // If no endpoints provided, return base info only
  if (!options?.latencyEndpoint && !options?.bandwidthEndpoint) {
    return baseInfo;
  }

  // Perform active measurements in parallel
  const [latencyMs, bandwidthMbps] = await Promise.all([
    options.latencyEndpoint ? measureLatency(options.latencyEndpoint, options.timeout) : Promise.resolve(undefined),
    options.bandwidthEndpoint
      ? measureBandwidth(options.bandwidthEndpoint, options.timeout)
      : Promise.resolve(undefined),
  ]);

  return {
    ...baseInfo,
    latencyMs: latencyMs ?? undefined,
    bandwidthMbps: bandwidthMbps ?? undefined,
  };
}
