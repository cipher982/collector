/**
 * Browser, Device, and Locale Context Collector
 *
 * Collects synchronous context information about the browser,
 * device hardware, and user locale/timezone.
 */

import type { BrowserInfo, DeviceInfo, LocaleInfo } from '../types.js';

/**
 * Collect browser information from navigator
 */
export function getBrowserInfo(): BrowserInfo {
  // Safe access with fallbacks for environments without full browser APIs
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const languages = nav?.languages ? Array.from(nav.languages) : [];

  return {
    userAgent: nav?.userAgent || '',
    language: nav?.language || '',
    languages,
    platform: nav?.platform || '',
    vendor: nav?.vendor || '',
    cookieEnabled: nav?.cookieEnabled ?? false,
    doNotTrack: nav?.doNotTrack === '1' || nav?.doNotTrack === 'yes',
    online: nav?.onLine ?? true,
  };
}

/**
 * Collect device hardware information
 */
export function getDeviceInfo(): DeviceInfo {
  const win = typeof window !== 'undefined' ? window : null;
  const screen = win?.screen;
  const nav = typeof navigator !== 'undefined' ? navigator : null;

  // Determine orientation
  let orientation: 'portrait' | 'landscape' = 'portrait';
  if (screen) {
    if (screen.orientation?.type) {
      // Modern API: 'portrait-primary', 'landscape-primary', etc.
      orientation = screen.orientation.type.startsWith('portrait') ? 'portrait' : 'landscape';
    } else if (screen.width && screen.height) {
      // Fallback: compare dimensions
      orientation = screen.height >= screen.width ? 'portrait' : 'landscape';
    }
  }

  return {
    screenWidth: screen?.width || 0,
    screenHeight: screen?.height || 0,
    viewportWidth: win?.innerWidth || 0,
    viewportHeight: win?.innerHeight || 0,
    colorDepth: screen?.colorDepth || 0,
    pixelRatio: win?.devicePixelRatio || 1,
    orientation,
    // Chrome-only properties (null for other browsers)
    deviceMemory: (nav as any)?.deviceMemory ?? null,
    hardwareConcurrency: nav?.hardwareConcurrency || 0,
    touchPoints: nav?.maxTouchPoints || 0,
  };
}

/**
 * Collect locale and timezone information
 */
export function getLocaleInfo(): LocaleInfo {
  const nav = typeof navigator !== 'undefined' ? navigator : null;

  // Get IANA timezone name
  let timezone = 'UTC';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Fallback to UTC if Intl API not available
  }

  // Get timezone offset in minutes
  const timezoneOffset = new Date().getTimezoneOffset();

  return {
    timezone,
    timezoneOffset,
    locale: nav?.language || '',
  };
}

/**
 * Collect all context data (browser + device + locale)
 */
export function collectContext() {
  return {
    browser: getBrowserInfo(),
    device: getDeviceInfo(),
    locale: getLocaleInfo(),
  };
}
