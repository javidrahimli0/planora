import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, apiFetchForm } from '@/lib/api';

describe('api helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('apiFetch sends default json and auth headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch<{ ok: boolean }>('/api/tasks', 'token-1');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/tasks', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
    });
  });

  it('apiFetch merges custom headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/events', 'token-2', {
      method: 'POST',
      headers: { 'X-Custom': '1' },
      body: JSON.stringify({ title: 'A' }),
    });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-2',
        'X-Custom': '1',
      },
      body: JSON.stringify({ title: 'A' }),
    });
  });

  it('apiFetch throws backend message on non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ message: 'Forbidden' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/tasks', 'token-1')).rejects.toThrow('Forbidden');
  });

  it('apiFetch throws fallback message when backend omits message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/tasks', 'token-1')).rejects.toThrow('Request failed');
  });

  it('apiFetchForm sends form data with auth header only', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ uploaded: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const formData = new FormData();
    formData.append('file', 'blob');

    const result = await apiFetchForm<{ uploaded: boolean }>('/api/upload', 'token-file', formData);

    expect(result).toEqual({ uploaded: true });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-file' },
      body: formData,
    });
  });

  it('apiFetchForm throws fallback message when missing backend message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const formData = new FormData();

    await expect(apiFetchForm('/api/upload', 'token-file', formData)).rejects.toThrow('Request failed');
  });

  it('apiFetchForm throws backend message on failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ message: 'Upload failed' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const formData = new FormData();

    await expect(apiFetchForm('/api/upload', 'token-file', formData)).rejects.toThrow('Upload failed');
  });
});
