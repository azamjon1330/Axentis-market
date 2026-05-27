import { UPLOADS_BASE_URL } from '../config';

export function getImageUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const clean = path.startsWith('uploads/') ? path.slice('uploads/'.length) : path;
  return `${UPLOADS_BASE_URL}/${clean}`;
}
