// Slug helper bersama (client publish + server) — dependency-free.
// 'SoftMedis v2' → 'softmedis-v2'; hanya [a-z0-9-], max 64 char, tak boleh kosong.

/** Ubah teks jadi slug URL-safe. */
export function slugify(s) {
  const out = String(s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return out || 'app';
}

/** Cek slug valid (mencegah path traversal & nama aneh). */
export function isSafeSlug(s) {
  return typeof s === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(s);
}