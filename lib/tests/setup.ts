/**
 * Vitest setup file
 * Runs before all tests to configure the test environment
 */

import { beforeEach, afterEach } from 'vitest';

// Clear all mocks and restore original implementations after each test
afterEach(() => {
  // Restore any spied/mocked functions
  if (typeof vi !== 'undefined') {
    vi.restoreAllMocks();
  }
});
