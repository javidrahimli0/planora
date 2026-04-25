import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('joins class values', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('filters falsy values', () => {
    expect(cn('base', false && 'hidden', null, undefined, 'ok')).toBe('base ok');
  });

  it('merges tailwind conflicts', () => {
    expect(cn('px-2', 'px-4', 'text-sm', 'text-lg')).toBe('px-4 text-lg');
  });

  it('supports object syntax from clsx', () => {
    expect(cn('base', { hidden: false, block: true, active: true })).toBe('base block active');
  });
});
