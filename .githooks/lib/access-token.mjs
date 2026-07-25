import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class AccessTokenError extends Error {}

/** Gets a Cloudflare Access token for `appUrl` via the cloudflared CLI. */
export async function getAccessToken(appUrl) {
  try {
    const { stdout } = await execFileAsync('cloudflared', ['access', 'token', '-app=' + appUrl]);
    const token = stdout.trim();
    if (!token) throw new Error('cloudflared returned an empty token');
    return token;
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new AccessTokenError('cloudflared is not installed or not on PATH. Install it, then run `cloudflared access login ' + appUrl + '`.');
    }
    throw new AccessTokenError(`Could not get a Cloudflare Access token for ${appUrl}. Run \`cloudflared access login ${appUrl}\` and try again.\n${err.message}`);
  }
}
