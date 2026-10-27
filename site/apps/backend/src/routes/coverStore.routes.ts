import { Elysia } from 'elysia';
import { parseCoverKey, type CoverStore } from '../services/coverStore';

/**
 * A cover nginx did not find in the store (apps/frontend/nginx.conf, /covers/): made, written and
 * handed back, so the next listener gets the file. Only the store's own keys: the address names an
 * id and a size, never a URL to fetch.
 */
export function coverStoreRoutes(store: CoverStore) {
  return new Elysia({ prefix: '/api/cover-store' }).get(
    '/:kind/:id/:file',
    async ({ params, set }) => {
      const key = parseCoverKey(params.kind, params.id, params.file);
      const cover = key ? await store.get(key) : 'missing';
      if (Buffer.isBuffer(cover)) {
        set.headers['content-type'] = 'image/webp';
        // A key names one image for good: a new art of the antenna comes under a new id.
        set.headers['cache-control'] = 'public, max-age=31536000, immutable';
        return new Blob([cover], { type: 'image/webp' });
      }
      if (cover === 'missing') {
        set.status = 404;
        // A record with no cover is asked about again the next day.
        if (key) set.headers['cache-control'] = 'public, max-age=86400';
        return { error: 'Pochette introuvable' };
      }
      set.status = 502;
      set.headers['cache-control'] = 'no-store';
      return { error: 'Pochette indisponible' };
    }
  );
}
