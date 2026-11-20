// Cover Snap entry packager (Node 22, standard library only, no build step).
// Copies this repo's app/ and screenshots/ into the output directory
// (MAKEFUN_OUTPUT_DIR, default /output), then writes dossier.json there with
// the vendored make.fun library, using the bounty's own caps so the entry is
// refused here exactly where the scorer would refuse it.
//
//   node serve.ts                            # try the app on http://localhost:8080
//   MAKEFUN_OUTPUT_DIR=/output node main.ts  # hand the entry in

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, DossierError } from './vendor/makefun-app.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The gta6-cover-art-01 gate's caps, passed whole so refusals match the scorer. */
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
} as const;

/** Replace one output subdirectory with a fresh copy of its repo counterpart. */
function copyFresh(name: string): void {
  const source = join(repoRoot, name);
  if (!existsSync(source)) throw new Error(`Cover Snap: missing ${name}/ beside main.ts`);
  const target = join(outputDir, name);
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
}

/** Read back dossier.json and prove it exists and parses; throw otherwise. */
function verifyDossier(path: string): void {
  if (!existsSync(path)) throw new Error('dossier.json was not written');
  const raw = readFileSync(path, 'utf8');
  if (raw.length === 0) throw new Error('dossier.json is empty');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`dossier.json is not valid JSON: ${(error as Error).message}`);
  }
  if (parsed === null || typeof parsed !== 'object') throw new Error('dossier.json is not a JSON object');
}

try {
  mkdirSync(outputDir, { recursive: true });
  copyFresh('app');
  copyFresh('screenshots');

  const dossier = buildDossier(outputDir, CAPS);
  const dossierPath = join(outputDir, 'dossier.json');
  writeFileSync(dossierPath, dossier);
  verifyDossier(dossierPath);
  console.log(`Cover Snap packed into ${outputDir} (dossier.json: ${dossier.length} bytes, verified)`);
} catch (error) {
  if (error instanceof DossierError) {
    console.error(`Cover Snap: the dossier was refused${error.limit ? ` (${error.limit})` : ''}: ${error.message}`);
  } else {
    console.error(`Cover Snap: ${(error as Error).message}`);
  }
  process.exitCode = 1;
}
