/**
 * Identity generation and persistence
 *
 * Based on existing implementation in static/script.js (lines 14-53)
 * - visitor_id: persistent across sessions (localStorage)
 * - session_id: persists until tab close (sessionStorage)
 * - pageview_id: new for each page load
 */

import type { IdentityData, IdentityConfig } from '../types.js';
import { getStorageItem, setStorageItem } from '../utils/storage.js';

/**
 * Generate a random ID with prefix
 *
 * Uses crypto.getRandomValues() when available, falls back to Math.random()
 * Format: prefix_hexstring (e.g., "v_a1b2c3d4e5f6...")
 */
function randomId(prefix: string): string {
  try {
    // Try crypto API first (secure random)
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${prefix}_${hex}`;
  } catch {
    // Fallback to Math.random() + timestamp
    const random = Math.random().toString(16).slice(2);
    const timestamp = Date.now().toString(16);
    return `${prefix}_${random}${timestamp}`;
  }
}

/**
 * Get or generate visitor ID (persistent across sessions)
 *
 * Stored in localStorage to persist across browser sessions.
 * Falls back to generating non-persistent ID if storage unavailable.
 */
export function getVisitorId(config: IdentityConfig): string {
  if (!config.persist) {
    return randomId('v');
  }

  const key = config.visitorIdKey;

  try {
    // Try to retrieve existing ID
    const existing = getStorageItem('local', key);
    if (existing) {
      return existing;
    }

    // Generate and store new ID
    const newId = randomId('v');
    setStorageItem('local', key, newId);
    return newId;
  } catch {
    // Storage failed, return non-persistent ID
    return randomId('v');
  }
}

/**
 * Get or generate session ID (persists until tab close)
 *
 * Stored in sessionStorage to persist only for the current browser session.
 * Falls back to generating non-persistent ID if storage unavailable.
 */
export function getSessionId(config: IdentityConfig): string {
  if (!config.persist) {
    return randomId('s');
  }

  const key = config.sessionIdKey;

  try {
    // Try to retrieve existing ID
    const existing = getStorageItem('session', key);
    if (existing) {
      return existing;
    }

    // Generate and store new ID
    const newId = randomId('s');
    setStorageItem('session', key, newId);
    return newId;
  } catch {
    // Storage failed, return non-persistent ID
    return randomId('s');
  }
}

/**
 * Generate pageview ID (new for each page load)
 *
 * Always generates a fresh ID, never persisted.
 */
export function getPageviewId(): string {
  return randomId('p');
}

/**
 * Collect all identity data
 *
 * @param config - Identity configuration
 * @returns Complete identity data (visitor, session, pageview IDs)
 */
export function collectIdentity(config: IdentityConfig): IdentityData {
  return {
    visitorId: getVisitorId(config),
    sessionId: getSessionId(config),
    pageviewId: getPageviewId(),
  };
}
