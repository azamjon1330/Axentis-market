import { UPLOADS_BASE_URL } from '../config';

export function getImageUrl(path: string | undefined | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  // Backend stores paths as "uploads/filename.png" but UPLOADS_BASE_URL already ends with /uploads
  // so we strip the leading "uploads/" to avoid double path
  const clean = path.startsWith('uploads/') ? path.slice('uploads/'.length) : path;
  return `${UPLOADS_BASE_URL}/${clean}`;
}
