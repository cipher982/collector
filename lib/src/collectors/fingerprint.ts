/**
 * Browser fingerprinting collector
 *
 * Implements various fingerprinting techniques for browser identification.
 * All fingerprinting is OPT-IN and disabled by default for privacy reasons.
 *
 * PRIVACY NOTE: This module should only be enabled with explicit user consent
 * and clear disclosure of what data is being collected.
 */

import type { FingerprintData, WebGLInfo } from '../types.js';

/**
 * Generate a simple hash from a string
 *
 * Uses a basic DJB2 hash algorithm. Not cryptographically secure,
 * but sufficient for fingerprinting purposes.
 *
 * @param str - String to hash
 * @returns Hex hash string
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Generate a canvas fingerprint
 *
 * Draws styled text on a canvas and exports as data URL.
 * Different browsers/systems render text slightly differently due to:
 * - Font rendering engines
 * - Anti-aliasing algorithms
 * - Graphics drivers
 *
 * @returns Canvas data URL or null if canvas not supported
 *
 * @example
 * ```typescript
 * const canvas = getCanvasFingerprint();
 * console.log(canvas); // "data:image/png;base64,..."
 * ```
 */
export function getCanvasFingerprint(): string | null {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return null;
    }

    canvas.width = 200;
    canvas.height = 50;

    // Draw text with different styles
    // (pattern from reference implementation)
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Hello, world!', 2, 15);

    return canvas.toDataURL();
  } catch (error) {
    // Canvas might be disabled or unavailable
    return null;
  }
}

/**
 * Generate a hashed canvas fingerprint
 *
 * Same as getCanvasFingerprint but returns a hash instead of the full data URL.
 * More privacy-friendly as it doesn't expose the actual rendering.
 *
 * @returns Hex hash of canvas or null if canvas not supported
 */
export function getCanvasFingerprintHash(): string | null {
  const dataUrl = getCanvasFingerprint();
  if (!dataUrl) {
    return null;
  }
  return simpleHash(dataUrl);
}

/**
 * Detect available fonts
 *
 * Tests a list of common fonts by measuring text width differences.
 * If a font renders differently than the baseline (monospace),
 * it's considered available.
 *
 * @param fontsToTest - Array of font names to test (defaults to common fonts)
 * @returns Array of detected font names
 *
 * @example
 * ```typescript
 * const fonts = detectFonts();
 * console.log(fonts); // ["Arial", "Georgia", "Helvetica"]
 * ```
 */
export function detectFonts(
  fontsToTest: string[] = [
    'Arial',
    'Courier New',
    'Georgia',
    'Times New Roman',
    'Verdana',
    'Helvetica',
    'Comic Sans MS',
    'Trebuchet MS',
    'Impact',
    'Palatino',
    'Garamond',
    'Bookman',
    'Tahoma',
  ]
): string[] {
  try {
    const baseFonts = ['monospace', 'sans-serif', 'serif'];
    const testString = 'mmmmmmmmmmlli';
    const testSize = '72px';

    // Create canvas for text measurement
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return [];
    }

    // Helper: detect if a font is available
    const detectFont = (font: string): boolean => {
      // Measure baseline (monospace)
      ctx.font = `${testSize} ${baseFonts[0]}`;
      const baseWidth = ctx.measureText(testString).width;

      // Measure with test font
      ctx.font = `${testSize} ${font},${baseFonts[0]}`;
      const testWidth = ctx.measureText(testString).width;

      // If widths differ, the font is available
      return baseWidth !== testWidth;
    };

    return fontsToTest.filter(detectFont);
  } catch (error) {
    return [];
  }
}

/**
 * Get WebGL rendering information
 *
 * Extracts vendor, renderer, version, and extensions from WebGL context.
 * This information reveals details about the GPU and graphics driver.
 *
 * @returns WebGL info object or null if WebGL not supported
 *
 * @example
 * ```typescript
 * const webgl = getWebGLInfo();
 * console.log(webgl.vendor); // "Google Inc. (NVIDIA)"
 * console.log(webgl.renderer); // "ANGLE (NVIDIA GeForce GTX 1080)"
 * ```
 */
export function getWebGLInfo(): WebGLInfo | null {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (!gl) {
      return null;
    }

    // Type assertion for WebGL context
    const context = gl as WebGLRenderingContext;

    // Get debug info extension for more detailed GPU info
    const debugInfo = context.getExtension('WEBGL_debug_renderer_info');

    return {
      vendor: debugInfo
        ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : context.getParameter(context.VENDOR),
      renderer: debugInfo
        ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : context.getParameter(context.RENDERER),
      version: context.getParameter(context.VERSION),
      shadingLanguage: context.getParameter(context.SHADING_LANGUAGE_VERSION),
      extensions: context.getSupportedExtensions() || [],
    };
  } catch (error) {
    // WebGL might be disabled or unavailable
    return null;
  }
}

/**
 * Collect all fingerprinting data
 *
 * Combines canvas, font, and WebGL fingerprinting.
 * Returns a complete FingerprintData object.
 *
 * @param options - Configuration for what to collect
 * @returns Complete fingerprint data
 *
 * @example
 * ```typescript
 * // Collect all fingerprints
 * const fingerprint = collectFingerprint();
 *
 * // Collect only canvas and fonts
 * const fingerprint = collectFingerprint({
 *   canvas: true,
 *   fonts: true,
 *   webgl: false,
 * });
 * ```
 */
export function collectFingerprint(options?: {
  canvas?: boolean;
  fonts?: boolean;
  webgl?: boolean;
  hashCanvas?: boolean;
}): FingerprintData {
  const defaultOptions = {
    canvas: true,
    fonts: true,
    webgl: true,
    hashCanvas: true, // Hash by default for privacy
  };

  const config = { ...defaultOptions, ...options };

  return {
    canvas: config.canvas ? (config.hashCanvas ? getCanvasFingerprintHash() : getCanvasFingerprint()) : null,
    fonts: config.fonts ? detectFonts() : [],
    webgl: config.webgl ? getWebGLInfo() : null,
  };
}
