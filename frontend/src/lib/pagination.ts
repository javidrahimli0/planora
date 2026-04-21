export function buildPagedPath(path: string, page: number, limit: number, extra: Record<string, string | number | boolean | null | undefined> = {}) {
  const [basePath, existingQuery] = path.split('?');
  const params = new URLSearchParams(existingQuery || '');

  params.set('page', String(page));
  params.set('limit', String(limit));

  Object.entries(extra).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      params.delete(key);
      return;
    }
    params.set(key, String(value));
  });

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
