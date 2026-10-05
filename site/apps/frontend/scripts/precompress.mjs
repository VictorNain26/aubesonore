// Writes a .gz next to each script and stylesheet of dist/assets, at gzip's best level, for
// nginx's gzip_static: on the fly it compresses at level 1, and Cloudflare passes an origin's
// gzip through unchanged (developers.cloudflare.com/speed/optimization/content/compression/).
// Assets are hashed, so this runs once per build instead of once per request.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { constants, gzipSync } from 'node:zlib';

const dir = 'dist/assets';
let before = 0;
let after = 0;
for (const name of await readdir(dir)) {
  if (!/\.(js|css)$/.test(name)) continue;
  const source = await readFile(`${dir}/${name}`);
  const gzipped = gzipSync(source, { level: constants.Z_BEST_COMPRESSION });
  before += source.length;
  after += gzipped.length;
  await writeFile(`${dir}/${name}.gz`, gzipped);
}
console.log(`precompressed dist/assets: ${before} B to ${after} B gzipped`);
