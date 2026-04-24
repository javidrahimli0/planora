export function getApiBaseUrl() {
  if (typeof window === 'undefined') {
    return process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  }

  return process.env.NEXT_PUBLIC_API_URL || '';
}

export function getSocketUrl() {
  if (typeof window === 'undefined') {
    return process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  }

  return process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || '';
}