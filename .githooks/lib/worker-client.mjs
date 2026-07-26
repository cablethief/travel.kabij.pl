import { readFileSync } from 'node:fs';

export class WorkerRequestError extends Error {}

/**
 * Uploads a local file to `${workerBaseUrl}/images/{author}/{path}`. Returns { url, key }.
 *
 * The token from `cloudflared access token` must be sent as the
 * `CF_Authorization` cookie — that's what Cloudflare Access's edge actually
 * checks to let the request through. `Cf-Access-Jwt-Assertion` is what
 * Access *adds itself* when forwarding an already-authenticated request to
 * the origin (which is what our Worker verifies) — sending it as a request
 * header from the client does nothing; Access still redirects to login.
 * Confirmed by testing both ways directly against the deployed Worker.
 */
export async function putImage({ workerBaseUrl, author, path: remotePath, filePath, contentType, accessToken }) {
  const body = readFileSync(filePath);
  const url = `${workerBaseUrl}/images/${author}/${remotePath}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      Cookie: `CF_Authorization=${accessToken}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new WorkerRequestError(`Upload failed for ${filePath} (HTTP ${res.status}): ${text}`);
  }
  return res.json();
}
