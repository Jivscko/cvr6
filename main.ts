// Cover Snap entry packager (Node 22, standard library only, no build step).
// Copies this repo's app/ and screenshots/ into the output directory
// (MAKEFUN_OUTPUT_DIR, default /output), then writes dossier.json there with
// the vendored make.fun library, using the bounty's own caps so the entry is
// refused here exactly where the scorer would refuse it.
//
//   node serve.ts                          # try the app on http://localhost:8080
//   MAKEFUN_OUTPUT_DIR=/output node main.ts  # hand the entry in

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Replace one output subdirectory with a fresh copy of its repo counterpart. */
function copyFresh(name: string): void {
  const source = join(repoRoot, name);
  if (!existsSync(source)) throw new Error(`Cover Snap: missing ${name}/ beside main.ts`);
  const target = join(outputDir, name);
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyFresh('app');
copyFresh('screenshots');

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

console.log(`Cover Snap packed into ${outputDir} (dossier.json: ${dossier.length} bytes)`);
