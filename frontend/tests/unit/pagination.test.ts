import { describe, expect, it } from 'vitest';
import { buildPagedPath } from '@/lib/pagination';

describe('buildPagedPath', () => {
  it('adds page and limit to path without query', () => {
    expect(buildPagedPath('/api/tasks', 2, 25)).toBe('/api/tasks?page=2&limit=25');
  });

  it('preserves existing query params', () => {
    expect(buildPagedPath('/api/events?from=2026-01-01', 1, 20)).toBe('/api/events?from=2026-01-01&page=1&limit=20');
  });

  it('replaces existing page and limit', () => {
    expect(buildPagedPath('/api/tasks?page=9&limit=99', 1, 10)).toBe('/api/tasks?page=1&limit=10');
  });

  it('adds extra params and stringifies values', () => {
    expect(
      buildPagedPath('/api/workspaces', 1, 12, { mine: true, count: 3, q: 'software' })
    ).toBe('/api/workspaces?page=1&limit=12&mine=true&count=3&q=software');
  });

  it('removes nullable and empty extra params', () => {
    expect(
      buildPagedPath('/api/workspaces?scope=all', 1, 12, { scope: '', mine: null, q: undefined, keep: 'yes' })
    ).toBe('/api/workspaces?page=1&limit=12&keep=yes');
  });

  it('removes existing query key when extra value is empty', () => {
    expect(
      buildPagedPath('/api/tasks?q=hello&status=pending', 1, 20, { q: '' })
    ).toBe('/api/tasks?status=pending&page=1&limit=20');
  });

  it('handles path ending with trailing question mark', () => {
    expect(buildPagedPath('/api/tasks?', 1, 5)).toBe('/api/tasks?page=1&limit=5');
  });
});
