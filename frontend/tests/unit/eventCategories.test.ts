import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EVENT_CATEGORIES_STORAGE_KEY,
  getDefaultEventCategories,
  loadUserEventCategories,
  resolveEventCategory,
  sanitizeCategoryColor,
  sanitizeEventCategories,
  saveUserEventCategories,
} from '@/lib/eventCategories';

describe('event category helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sanitizeCategoryColor returns fallback for invalid values', () => {
    expect(sanitizeCategoryColor('invalid')).toBe('#6366f1');
    expect(sanitizeCategoryColor('#ABCDEF')).toBe('#abcdef');
  });

  it('sanitizeEventCategories removes invalid entries and duplicates', () => {
    const sanitized = sanitizeEventCategories([
      { type: 'work', label: 'Work', color: '#f97316' },
      { type: 'work', label: 'Work duplicate', color: '#000000' },
      { type: 'personal', label: 'Personal', color: '#3B82F6' },
      { type: 'bad type', label: '', color: '#111111' },
    ]);

    expect(sanitized).toEqual([
      { type: 'personal', label: 'Personal', color: '#3b82f6', description: undefined },
      { type: 'work', label: 'Work', color: '#f97316', description: undefined },
    ]);
  });

  it('loadUserEventCategories falls back to defaults for invalid stored json', () => {
    const getItem = vi.fn().mockReturnValue('{invalid-json');
    vi.stubGlobal('window', {
      localStorage: { getItem, setItem: vi.fn() },
      dispatchEvent: vi.fn(),
    } as any);

    const loaded = loadUserEventCategories();

    expect(loaded).toEqual(getDefaultEventCategories());
  });

  it('saveUserEventCategories stores cleaned data and dispatches change event', () => {
    const setItem = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', {
      localStorage: { getItem: vi.fn(), setItem },
      dispatchEvent,
    } as any);

    saveUserEventCategories([
      { type: 'work', label: 'Work', color: '#F97316' },
      { type: 'work', label: 'Duplicate', color: '#111111' },
    ] as any);

    expect(setItem).toHaveBeenCalledWith(
      EVENT_CATEGORIES_STORAGE_KEY,
      JSON.stringify([{ type: 'work', label: 'Work', color: '#f97316' }])
    );
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });

  it('resolveEventCategory finds by type, then color, then default', () => {
    const categories = [
      { type: 'work', label: 'Work', color: '#f97316' },
      { type: 'team', label: 'Team', color: '#8b5cf6' },
    ] as any;

    expect(resolveEventCategory('team', null, categories).type).toBe('team');
    expect(resolveEventCategory('missing', '#f97316', categories).type).toBe('work');
    expect(resolveEventCategory('missing', '#14b8a6', categories).type).toBe('health');
    expect(resolveEventCategory('missing', null, categories).type).toBe('work');
  });
});
