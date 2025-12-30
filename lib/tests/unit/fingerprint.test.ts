/**
 * Unit tests for fingerprint.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCanvasFingerprint,
  getCanvasFingerprintHash,
  detectFonts,
  getWebGLInfo,
  collectFingerprint,
} from '../../src/collectors/fingerprint.js';

describe('fingerprint collectors', () => {
  describe('getCanvasFingerprint', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should generate canvas fingerprint', () => {
      // Mock canvas and context
      const mockToDataURL = vi.fn(() => 'data:image/png;base64,ABC123');
      const mockContext = {
        textBaseline: '',
        font: '',
        fillStyle: '',
        fillRect: vi.fn(),
        fillText: vi.fn(),
      };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockContext),
        toDataURL: mockToDataURL,
      };

      // Mock document.createElement
      global.document = {
        createElement: vi.fn(() => mockCanvas),
      } as any;

      const fingerprint = getCanvasFingerprint();

      expect(fingerprint).toBe('data:image/png;base64,ABC123');
      expect(mockCanvas.width).toBe(200);
      expect(mockCanvas.height).toBe(50);
      expect(mockContext.fillRect).toHaveBeenCalledWith(125, 1, 62, 20);
      expect(mockContext.fillText).toHaveBeenCalledWith('Hello, world!', 2, 15);
    });

    it('should return null if canvas not supported', () => {
      const mockCanvas = {
        getContext: vi.fn(() => null),
      };

      global.document = {
        createElement: vi.fn(() => mockCanvas),
      } as any;

      const fingerprint = getCanvasFingerprint();

      expect(fingerprint).toBeNull();
    });

    it('should return null on canvas error', () => {
      global.document = {
        createElement: vi.fn(() => {
          throw new Error('Canvas disabled');
        }),
      } as any;

      const fingerprint = getCanvasFingerprint();

      expect(fingerprint).toBeNull();
    });

    it('should draw with correct styles', () => {
      const mockContext = {
        textBaseline: '',
        font: '',
        fillStyle: '',
        fillRect: vi.fn(),
        fillText: vi.fn(),
      };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockContext),
        toDataURL: vi.fn(() => 'data:image/png;base64,TEST'),
      };

      global.document = {
        createElement: vi.fn(() => mockCanvas),
      } as any;

      getCanvasFingerprint();

      expect(mockContext.textBaseline).toBe('top');
      expect(mockContext.font).toBe('14px Arial');
      expect(mockContext.fillStyle).toBe('#069'); // Last set value
    });
  });

  describe('getCanvasFingerprintHash', () => {
    it('should return hash of canvas fingerprint', () => {
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          textBaseline: '',
          font: '',
          fillStyle: '',
          fillRect: vi.fn(),
          fillText: vi.fn(),
        })),
        toDataURL: vi.fn(() => 'data:image/png;base64,CONSISTENT'),
      };

      global.document = {
        createElement: vi.fn(() => mockCanvas),
      } as any;

      const hash = getCanvasFingerprintHash();

      // Should be a hex string
      expect(hash).toMatch(/^[0-9a-f]+$/);
      expect(hash).not.toContain('data:image/png');

      // Same input should give same hash
      const hash2 = getCanvasFingerprintHash();
      expect(hash2).toBe(hash);
    });

    it('should return null if canvas fingerprint fails', () => {
      global.document = {
        createElement: vi.fn(() => ({
          getContext: vi.fn(() => null),
        })),
      } as any;

      const hash = getCanvasFingerprintHash();

      expect(hash).toBeNull();
    });

    it('should produce different hashes for different inputs', () => {
      let callCount = 0;
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          textBaseline: '',
          font: '',
          fillStyle: '',
          fillRect: vi.fn(),
          fillText: vi.fn(),
        })),
        toDataURL: vi.fn(() => {
          callCount++;
          return `data:image/png;base64,VERSION${callCount}`;
        }),
      };

      global.document = {
        createElement: vi.fn(() => mockCanvas),
      } as any;

      const hash1 = getCanvasFingerprintHash();
      const hash2 = getCanvasFingerprintHash();

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('detectFonts', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should detect available fonts', () => {
      const widths = new Map([
        ['72px monospace', 100],
        ['72px Arial,monospace', 105], // Different = available
        ['72px Courier New,monospace', 100], // Same = not available
        ['72px Georgia,monospace', 110], // Different = available
      ]);

      const mockContext = {
        font: '',
        measureText: vi.fn((text: string) => ({
          width: widths.get((mockContext as any).font) || 100,
        })),
      };

      const mockCanvas = {
        getContext: vi.fn(() => mockContext),
      };

      global.document = {
        createElement: vi.fn(() => mockCanvas),
      } as any;

      const fonts = detectFonts(['Arial', 'Courier New', 'Georgia']);

      expect(fonts).toContain('Arial');
      expect(fonts).not.toContain('Courier New');
      expect(fonts).toContain('Georgia');
    });

    it('should return empty array if canvas not supported', () => {
      global.document = {
        createElement: vi.fn(() => ({
          getContext: vi.fn(() => null),
        })),
      } as any;

      const fonts = detectFonts();

      expect(fonts).toEqual([]);
    });

    it('should return empty array on error', () => {
      global.document = {
        createElement: vi.fn(() => {
          throw new Error('Canvas error');
        }),
      } as any;

      const fonts = detectFonts();

      expect(fonts).toEqual([]);
    });

    it('should test default font list when no fonts provided', () => {
      const mockContext = {
        font: '',
        measureText: vi.fn(() => ({ width: 100 })),
      };

      const mockCanvas = {
        getContext: vi.fn(() => mockContext),
      };

      global.document = {
        createElement: vi.fn(() => mockCanvas),
      } as any;

      const fonts = detectFonts(); // No args = use defaults

      // Should have called measureText many times for default fonts
      expect(mockContext.measureText.mock.calls.length).toBeGreaterThan(10);
    });

    it('should use correct test string and size', () => {
      const mockContext = {
        font: '',
        measureText: vi.fn(() => ({ width: 100 })),
      };

      const mockCanvas = {
        getContext: vi.fn(() => mockContext),
      };

      global.document = {
        createElement: vi.fn(() => mockCanvas),
      } as any;

      detectFonts(['Arial']);

      expect(mockContext.measureText).toHaveBeenCalledWith('mmmmmmmmmmlli');
      expect(mockContext.font).toContain('72px');
    });
  });

  describe('getWebGLInfo', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should collect WebGL info', () => {
      const mockGL = {
        VENDOR: 37445,
        RENDERER: 37446,
        VERSION: 37447,
        SHADING_LANGUAGE_VERSION: 37448,
        getParameter: vi.fn((param: number) => {
          const values: Record<number, string> = {
            37445: 'Google Inc.',
            37446: 'ANGLE (NVIDIA)',
            37447: 'WebGL 1.0',
            37448: 'GLSL ES 1.0',
          };
          return values[param];
        }),
        getSupportedExtensions: vi.fn(() => ['WEBGL_debug_renderer_info', 'OES_texture_float']),
        getExtension: vi.fn(() => null), // No debug extension
      };

      const mockCanvas = {
        getContext: vi.fn(() => mockGL),
      };

      global.document = {
        createElement: vi.fn(() => mockCanvas),
      } as any;

      const webgl = getWebGLInfo();

      expect(webgl).not.toBeNull();
      expect(webgl?.vendor).toBe('Google Inc.');
      expect(webgl?.renderer).toBe('ANGLE (NVIDIA)');
      expect(webgl?.version).toBe('WebGL 1.0');
      expect(webgl?.shadingLanguage).toBe('GLSL ES 1.0');
      expect(webgl?.extensions).toContain('WEBGL_debug_renderer_info');
    });

    it('should use debug extension for unmasked info if available', () => {
      const mockDebugExtension = {
        UNMASKED_VENDOR_WEBGL: 37445,
        UNMASKED_RENDERER_WEBGL: 37446,
      };

      const mockGL = {
        VENDOR: 1001,
        RENDERER: 1002,
        VERSION: 1003,
        SHADING_LANGUAGE_VERSION: 1004,
        getParameter: vi.fn((param: number) => {
          // Return unmasked values for debug extension params
          if (param === 37445) return 'Real Vendor Inc.';
          if (param === 37446) return 'Real GPU Renderer';
          if (param === 1003) return 'WebGL 1.0';
          if (param === 1004) return 'GLSL ES 1.0';
          return 'Masked Value';
        }),
        getSupportedExtensions: vi.fn(() => ['WEBGL_debug_renderer_info']),
        getExtension: vi.fn(() => mockDebugExtension),
      };

      const mockCanvas = {
        getContext: vi.fn(() => mockGL),
      };

      global.document = {
        createElement: vi.fn(() => mockCanvas),
      } as any;

      const webgl = getWebGLInfo();

      expect(webgl?.vendor).toBe('Real Vendor Inc.');
      expect(webgl?.renderer).toBe('Real GPU Renderer');
    });

    it('should return null if WebGL not supported', () => {
      const mockCanvas = {
        getContext: vi.fn(() => null),
      };

      global.document = {
        createElement: vi.fn(() => mockCanvas),
      } as any;

      const webgl = getWebGLInfo();

      expect(webgl).toBeNull();
    });

    it('should handle experimental-webgl context', () => {
      const mockGL = {
        VENDOR: 37445,
        RENDERER: 37446,
        VERSION: 37447,
        SHADING_LANGUAGE_VERSION: 37448,
        getParameter: vi.fn(() => 'test'),
        getSupportedExtensions: vi.fn(() => []),
        getExtension: vi.fn(() => null),
      };

      const mockCanvas = {
        getContext: vi.fn((type: string) => {
          if (type === 'experimental-webgl') return mockGL;
          return null;
        }),
      };

      global.document = {
        createElement: vi.fn(() => mockCanvas),
      } as any;

      const webgl = getWebGLInfo();

      expect(webgl).not.toBeNull();
      expect(mockCanvas.getContext).toHaveBeenCalledWith('webgl');
      expect(mockCanvas.getContext).toHaveBeenCalledWith('experimental-webgl');
    });

    it('should return null on WebGL error', () => {
      global.document = {
        createElement: vi.fn(() => {
          throw new Error('WebGL error');
        }),
      } as any;

      const webgl = getWebGLInfo();

      expect(webgl).toBeNull();
    });

    it('should handle null extensions list', () => {
      const mockGL = {
        VENDOR: 37445,
        RENDERER: 37446,
        VERSION: 37447,
        SHADING_LANGUAGE_VERSION: 37448,
        getParameter: vi.fn(() => 'test'),
        getSupportedExtensions: vi.fn(() => null), // Some browsers return null
        getExtension: vi.fn(() => null),
      };

      const mockCanvas = {
        getContext: vi.fn(() => mockGL),
      };

      global.document = {
        createElement: vi.fn(() => mockCanvas),
      } as any;

      const webgl = getWebGLInfo();

      expect(webgl?.extensions).toEqual([]);
    });
  });

  describe('collectFingerprint', () => {
    beforeEach(() => {
      vi.clearAllMocks();

      // Set up working mocks for all methods
      const mockContext = {
        textBaseline: '',
        font: '',
        fillStyle: '',
        fillRect: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn(() => ({ width: 100 })),
      };

      const mockGL = {
        VENDOR: 37445,
        RENDERER: 37446,
        VERSION: 37447,
        SHADING_LANGUAGE_VERSION: 37448,
        getParameter: vi.fn(() => 'test'),
        getSupportedExtensions: vi.fn(() => ['ext1']),
        getExtension: vi.fn(() => null),
      };

      global.document = {
        createElement: vi.fn((tag: string) => {
          if (tag === 'canvas') {
            return {
              width: 0,
              height: 0,
              getContext: vi.fn((type?: string) => {
                if (type === 'webgl' || type === 'experimental-webgl') return mockGL;
                return mockContext;
              }),
              toDataURL: vi.fn(() => 'data:image/png;base64,ABC'),
            };
          }
          return null;
        }),
      } as any;
    });

    it('should collect all fingerprints by default', () => {
      const fingerprint = collectFingerprint();

      expect(fingerprint.canvas).not.toBeNull();
      expect(fingerprint.fonts).toBeInstanceOf(Array);
      expect(fingerprint.webgl).not.toBeNull();
    });

    it('should hash canvas by default', () => {
      const fingerprint = collectFingerprint();

      // Should be a hash, not a data URL
      expect(fingerprint.canvas).toMatch(/^[0-9a-f]+$/);
      expect(fingerprint.canvas).not.toContain('data:image/png');
    });

    it('should return raw canvas when hashCanvas is false', () => {
      const fingerprint = collectFingerprint({ hashCanvas: false });

      expect(fingerprint.canvas).toContain('data:image/png');
    });

    it('should respect canvas option', () => {
      const fingerprint = collectFingerprint({ canvas: false });

      expect(fingerprint.canvas).toBeNull();
    });

    it('should respect fonts option', () => {
      const fingerprint = collectFingerprint({ fonts: false });

      expect(fingerprint.fonts).toEqual([]);
    });

    it('should respect webgl option', () => {
      const fingerprint = collectFingerprint({ webgl: false });

      expect(fingerprint.webgl).toBeNull();
    });

    it('should allow selective collection', () => {
      const fingerprint = collectFingerprint({
        canvas: true,
        fonts: false,
        webgl: false,
      });

      expect(fingerprint.canvas).not.toBeNull();
      expect(fingerprint.fonts).toEqual([]);
      expect(fingerprint.webgl).toBeNull();
    });

    it('should handle all methods failing gracefully', () => {
      global.document = {
        createElement: vi.fn(() => ({
          getContext: vi.fn(() => null),
        })),
      } as any;

      const fingerprint = collectFingerprint();

      expect(fingerprint.canvas).toBeNull();
      expect(fingerprint.fonts).toEqual([]);
      expect(fingerprint.webgl).toBeNull();
    });

    it('should collect nothing when all options disabled', () => {
      const fingerprint = collectFingerprint({
        canvas: false,
        fonts: false,
        webgl: false,
      });

      expect(fingerprint.canvas).toBeNull();
      expect(fingerprint.fonts).toEqual([]);
      expect(fingerprint.webgl).toBeNull();
    });
  });
});
