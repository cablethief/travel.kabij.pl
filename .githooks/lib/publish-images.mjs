#!/usr/bin/env node
import { loadHooksConfig } from './config.mjs';
import { repoRoot } from './git.mjs';
import { MissingIdentityError, readLocalAuthorIdentity } from './identity.mjs';
import { memoizedAccessToken } from './access-token.mjs';
import { SyncImagesError, syncMyImages } from './sync-my-images.mjs';

async function main() {
  const root = repoRoot();

  let identity;
  try {
    identity = readLocalAuthorIdentity();
  } catch (err) {
    if (err instanceof MissingIdentityError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const { workerBaseUrl, accessAppUrl } = loadHooksConfig();
  const getAccessToken = memoizedAccessToken(accessAppUrl);

  try {
    const { checked, uploaded } = await syncMyImages({ root, mySlug: identity.slug, workerBaseUrl, getAccessToken });
    console.log(`publish-images: checked ${checked} local image(s) under public/images/${identity.slug}/, uploaded ${uploaded}.`);
  } catch (err) {
    if (err instanceof SyncImagesError) {
      console.error(`publish-images: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err.stack ?? String(err));
  process.exit(1);
});
