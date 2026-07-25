import type { Env } from './index';
import { resolveAuthorSlug } from './authors';

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);
const MAX_BYTES = 15 * 1024 * 1024;

export async function handlePut(request: Request, env: Env, author: string, path: string, email: string): Promise<Response> {
  if (resolveAuthorSlug(email) !== author) {
    return new Response('You can only upload to your own author folder', { status: 403 });
  }
  if (!path) {
    return new Response('Missing image path', { status: 400 });
  }

  const contentType = request.headers.get('Content-Type') ?? '';
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return new Response(`Unsupported Content-Type: ${contentType}`, { status: 415 });
  }

  const contentLength = Number(request.headers.get('Content-Length') ?? '0');
  if (contentLength > MAX_BYTES) {
    return new Response(`Image exceeds ${MAX_BYTES} byte limit`, { status: 413 });
  }
  if (!request.body) {
    return new Response('Missing request body', { status: 400 });
  }

  const key = `${author}/${path}`;
  await env.IMAGES_BUCKET.put(key, request.body, { httpMetadata: { contentType } });

  return new Response(JSON.stringify({ url: `${env.PUBLIC_IMAGES_BASE_URL}/${key}`, key }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleList(env: Env, author: string, subPrefix: string | null): Promise<Response> {
  const prefix = subPrefix ? `${author}/${subPrefix}` : `${author}/`;
  const items: { path: string; url: string; size: number; uploaded: string; contentType: string | undefined }[] = [];

  let cursor: string | undefined;
  do {
    const page = await env.IMAGES_BUCKET.list({ prefix, cursor, include: ['httpMetadata'] });
    for (const obj of page.objects) {
      items.push({
        path: obj.key.slice(`${author}/`.length),
        url: `${env.PUBLIC_IMAGES_BASE_URL}/${obj.key}`,
        size: obj.size,
        uploaded: obj.uploaded.toISOString(),
        contentType: obj.httpMetadata?.contentType,
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return new Response(JSON.stringify(items), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export async function handleDelete(env: Env, author: string, path: string, email: string): Promise<Response> {
  if (resolveAuthorSlug(email) !== author) {
    return new Response('You can only delete your own author folder', { status: 403 });
  }
  if (!path) {
    return new Response('Missing image path', { status: 400 });
  }

  await env.IMAGES_BUCKET.delete(`${author}/${path}`);
  return new Response(null, { status: 204 });
}
