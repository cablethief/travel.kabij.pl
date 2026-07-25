import { readFileSync } from 'node:fs';

export class WorkerRequestError extends Error {}

/** Uploads a local file to `${workerBaseUrl}/images/{author}/{path}`. Returns { url, key }. */
export async function putImage({ workerBaseUrl, author, path: remotePath, filePath, contentType, accessToken }) {
  const body = readFileSync(filePath);
  const url = `${workerBaseUrl}/images/${author}/${remotePath}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Cf-Access-Jwt-Assertion': accessToken,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new WorkerRequestError(`Upload failed for ${filePath} (HTTP ${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Lists an author's images: [{ path, url, size, uploaded, contentType }].
 * Access-gated (the whole images-api.* hostname is behind Cloudflare Access,
 * not just the write routes — Access enforces per-hostname, not per-method).
 * Only called from the delete-reconciliation path during a publish, where an
 * access token is already required anyway; the pull hook derives what to
 * download from local post content instead, precisely to avoid needing this.
 */
export async function listImages({ workerBaseUrl, author, prefix, accessToken }) {
  const url = new URL(`${workerBaseUrl}/images/${author}`);
  if (prefix) url.searchParams.set('prefix', prefix);
  const res = await fetch(url, { headers: accessToken ? { 'Cf-Access-Jwt-Assertion': accessToken } : {} });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new WorkerRequestError(`Listing images failed for ${author} (HTTP ${res.status}): ${text}`);
  }
  return res.json();
}

/** Deletes one uploaded image. Access-gated — same author-ownership rule as putImage. */
export async function deleteImage({ workerBaseUrl, author, path: remotePath, accessToken }) {
  const url = `${workerBaseUrl}/images/${author}/${remotePath}`;
  const res = await fetch(url, { method: 'DELETE', headers: { 'Cf-Access-Jwt-Assertion': accessToken } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new WorkerRequestError(`Delete failed for ${remotePath} (HTTP ${res.status}): ${text}`);
  }
}
