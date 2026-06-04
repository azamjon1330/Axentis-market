import { UPLOADS_BASE_URL } from '../config';

export function getImageUrl(path: string | undefined | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  // Backend may return "/uploads/..." or "uploads/..." — both need to become UPLOADS_BASE_URL/...
  const clean = path.startsWith('/uploads/')
    ? path.slice('/uploads/'.length)
    : path.startsWith('uploads/')
    ? path.slice('uploads/'.length)
    : path.startsWith('/')
    ? path.slice(1)
    : path;
  return `${UPLOADS_BASE_URL}/${clean}`;
}
