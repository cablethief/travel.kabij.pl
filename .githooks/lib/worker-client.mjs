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
