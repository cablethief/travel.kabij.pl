import { verifyAccessRequest } from './auth';
import { handleList, handlePut } from './images';

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
      if (request.method === 'GET' && !path) {
        // Listing is intentionally public — see README: individual image
        // reads are served straight from R2's own public custom domain,
        // never through this Worker, so this Worker's only job is the
        // Access-gated write path plus this list endpoint the pull hook
        // uses to know what's available. Nothing here is sensitive.
        return await handleList(env, author);
      }
      return new Response('Method not allowed', { status: 405 });
    } catch (err) {
      if (err instanceof Response) return err;
      console.error(err);
      return new Response('Internal error', { status: 500 });
    }
  },
};
