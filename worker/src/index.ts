import { verifyAccessRequest } from './auth';
import { handleDelete, handleList, handlePut } from './images';

export interface Env {
  IMAGES_BUCKET: R2Bucket;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  PUBLIC_IMAGES_BASE_URL: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);

    if (segments[0] !== 'images' || segments.length < 2) {
      return new Response('Not found', { status: 404 });
    }
    const author = segments[1];
    const path = segments.slice(2).join('/');

    try {
      if (request.method === 'PUT') {
        if (!path) return new Response('Missing image path', { status: 400 });
        const { email } = await verifyAccessRequest(request, env);
        return await handlePut(request, env, author, path, email);
      }
      if (request.method === 'DELETE') {
        if (!path) return new Response('Missing image path', { status: 400 });
        const { email } = await verifyAccessRequest(request, env);
        return await handleDelete(env, author, path, email);
      }
      if (request.method === 'GET' && !path) {
        // The whole images-api.* hostname sits behind a Cloudflare Access
        // Application, which enforces per-hostname, not per-method — so
        // this route requires Access too, same as PUT/DELETE, even though
        // its content isn't sensitive (used only by the delete-reconciliation
        // step during a publish, where a token is already required anyway).
        // Individual image reads bypass this Worker entirely — see README —
        // served straight from R2's own public custom domain instead.
        const { email } = await verifyAccessRequest(request, env);
        void email; // no author-scoping needed for reads; verifying just proves a valid Access session
        return await handleList(env, author, url.searchParams.get('prefix'));
      }
      return new Response('Method not allowed', { status: 405 });
    } catch (err) {
      if (err instanceof Response) return err;
      console.error(err);
      return new Response('Internal error', { status: 500 });
    }
  },
};
