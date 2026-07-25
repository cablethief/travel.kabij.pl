import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './index';

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

/**
 * Verifies the Cloudflare Access JWT on the request (the `Cf-Access-Jwt-Assertion`
 * header, not the `CF_Authorization` cookie — the header is what non-browser
 * clients like our git hook actually send, per Cloudflare's own guidance).
 * Throws a Response on any failure so callers can `return` it directly.
 */
export async function verifyAccessRequest(request: Request, env: Env): Promise<{ email: string }> {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) {
    throw new Response('Missing Cf-Access-Jwt-Assertion header', { status: 401 });
  }

  jwks ??= createRemoteJWKSet(new URL(`${env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));

  let email: string | undefined;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.CF_ACCESS_TEAM_DOMAIN,
      audience: env.CF_ACCESS_AUD,
    });
    email = payload.email as string | undefined;
  } catch {
    throw new Response('Invalid or expired Access token', { status: 401 });
  }

  if (!email) {
    throw new Response('Access token missing email claim', { status: 403 });
  }
  return { email };
}
