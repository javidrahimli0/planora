import { describe, it, expect } from 'vitest';
import { getSocketServer, setSocketServer } from '../../src/lib/socket';

describe('socket server registry', () => {
  it('returns null by default', () => {
    expect(getSocketServer()).toBeNull();
  });

  it('stores and returns socket server instance', () => {
    const fakeServer = { emit: () => undefined } as any;
    setSocketServer(fakeServer);

    expect(getSocketServer()).toBe(fakeServer);
  });

  it('allows overwriting socket server instance', () => {
    const firstServer = { id: 'first' } as any;
    const secondServer = { id: 'second' } as any;

    setSocketServer(firstServer);
    setSocketServer(secondServer);

    expect(getSocketServer()).toBe(secondServer);
  });
});
