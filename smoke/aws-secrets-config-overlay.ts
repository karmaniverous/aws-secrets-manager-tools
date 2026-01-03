/**
 * Requirements addressed:
 * - Provide an end-to-end smoke test that exercises:
 *   - getdotenv config overlay (rootOptionDefaults + plugins.aws)
 *   - secrets push/pull/delete
 *   - template bootstrap for pull destination
 * - Keep AWS login behavior: use aws plugin loginOnDemand in config.
 * - Keep fixtures committed; use config swap/restore under repo root.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import {
  assertContains,
  assertSmokeFixturesPresent,
  expectCommandFail,
  expectCommandOk,
  fileExists,
  findRepoRoot,
  getAwsSecretsFixturePaths,
  loadSmokeEnv,
  makeSecretId,
  mkdirp,
  readText,
  rmrf,
  runAwsSecretsManagerToolsCli,
  shouldKeepArtifacts,
  SMOKE_OVERLAY_CONFIG_FIXTURE_REL,
  SMOKE_TEMPLATE_SENTINEL,
} from './smokeLib';

const listRootConfigs = async (repoRoot: string): Promise<string[]> => {
  const names = await fs.readdir(repoRoot);
  return names.filter(
    (n) =>
      n.startsWith('getdotenv.config.') ||
      n.startsWith('getdotenv.config.local.'),
  );
};

const withConfigOverlay = async <T>(
  repoRoot: string,
  smokeEnv: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> => {
  const runId = `${String(Date.now())}-${Math.random().toString(16).slice(2)}`;
  const backupRoot = path.resolve(repoRoot, '.smoke-backup');
  const backupDir = path.resolve(backupRoot, runId);
  await mkdirp(backupDir);

  const moved: Array<{ from: string; to: string }> = [];
  const configPath = path.resolve(repoRoot, 'getdotenv.config.json');

  try {
    // Move any existing configs (public + local) out of the way to ensure our
    // overlay is authoritative for this smoke run.
    const existing = await listRootConfigs(repoRoot);
    for (const name of existing) {
      const from = path.resolve(repoRoot, name);
      const to = path.resolve(backupDir, name);
      await fs.rename(from, to);
      moved.push({ from, to });
    }

    // Install committed overlay config fixture as the canonical filename.
    // This fixture interpolates $SMOKE_AWS_PROFILE from process.env (provided via smokeEnv).
    const fixturePath = path.resolve(
      repoRoot,
      SMOKE_OVERLAY_CONFIG_FIXTURE_REL,
    );
    await fs.copyFile(fixturePath, configPath);

    // Ensure the spawned CLI has the env vars required for interpolation.
    if (!smokeEnv.SMOKE_AWS_PROFILE) {
      throw new Error('SMOKE_AWS_PROFILE is missing; check smoke/.env.');
    }

    return await fn();
  } finally {
    // Remove our temporary config and restore anything we moved.
    if (await fileExists(configPath)) {
      await rmrf(configPath);
    }
    for (const m of moved) {
      // only restore if original path is still free
      if (!(await fileExists(m.from))) {
        await fs.rename(m.to, m.from);
      }
    }
    await rmrf(backupDir);

    // Best-effort prune parent if empty (do not delete unrelated backups).
    try {
      const remaining = await fs.readdir(backupRoot);
      if (!remaining.length) await fs.rmdir(backupRoot);
    } catch {
      // ignore
    }
  }
};

const main = async (): Promise<void> => {
  const repoRoot = await findRepoRoot(process.cwd());
  const smokeEnv = await loadSmokeEnv(repoRoot);
  const keepArtifacts = shouldKeepArtifacts(smokeEnv);
  const secretId = makeSecretId();

  await assertSmokeFixturesPresent({ repoRoot });
  const fixtures = getAwsSecretsFixturePaths({ repoRoot });

  try {
    // Ensure target does not exist before pull bootstraps it.
    await rmrf(fixtures.localAbs);

    await withConfigOverlay(repoRoot, smokeEnv, async () => {
      // No root flags and no aws flags: config overlay should supply both.
      expectCommandOk(
        await runAwsSecretsManagerToolsCli({
          repoRoot,
          env: smokeEnv,
          argv: [
            'aws',
            'secrets',
            'push',
            '-s',
            secretId,
            '--from',
            'file:global:public',
          ],
        }),
        'config-overlay: push',
      );

      expectCommandOk(
        await runAwsSecretsManagerToolsCli({
          repoRoot,
          env: smokeEnv,
          argv: [
            'aws',
            'secrets',
            'pull',
            '-s',
            secretId,
            '--to',
            'global:private',
          ],
        }),
        'config-overlay: pull',
      );

      const localText = await readText(fixtures.localAbs);
      assertContains(
        localText,
        SMOKE_TEMPLATE_SENTINEL,
        'expected .env.local to be bootstrapped from template and preserve comments',
      );
      // The fixture .env is pushed, so all its keys should be present after pull.
      const expected = await (
        await import('./smokeLib')
      ).readDotenvFileMap(fixtures.envAbs);
      for (const [k, v] of Object.entries(expected)) {
        assertContains(
          localText,
          `${k}=${v}`,
          `expected .env.local to contain ${k}=${v}`,
        );
      }

      expectCommandOk(
        await runAwsSecretsManagerToolsCli({
          repoRoot,
          env: smokeEnv,
          argv: ['aws', 'secrets', 'delete', '-s', secretId, '--force'],
        }),
        'config-overlay: delete',
      );

      expectCommandFail(
        await runAwsSecretsManagerToolsCli({
          repoRoot,
          env: smokeEnv,
          argv: [
            'aws',
            'secrets',
            'pull',
            '-s',
            secretId,
            '--to',
            'global:private',
          ],
        }),
        'config-overlay: pull after delete',
      );
    });
  } finally {
    if (!keepArtifacts) await rmrf(fixtures.localAbs);
  }
};

await main();
