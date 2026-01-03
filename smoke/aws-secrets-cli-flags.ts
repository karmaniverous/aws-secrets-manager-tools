/**
 * Requirements addressed:
 * - Provide an end-to-end smoke test that exercises:
 *   - CLI flags (no config overlay)
 *   - secrets push/pull/delete
 *   - template bootstrap for pull destination
 * - Keep AWS login behavior: use aws plugin --login-on-demand.
 * - Use committed fixtures under smoke/fixtures and committed defaults under
 *   smoke/.env with optional overrides in smoke/.env.local.
 */

import {
  assertContains,
  assertSmokeFixturesPresent,
  expectCommandFail,
  expectCommandOk,
  findRepoRoot,
  getAwsSecretsFixturePaths,
  loadSmokeEnv,
  logCommandOk,
  makeSecretId,
  readDotenvFileMap,
  readText,
  rmrf,
  runAwsSecretsManagerToolsCli,
  shouldKeepArtifacts,
  SMOKE_AWS_SECRETS_FIXTURES_DIR_REL,
  SMOKE_TEMPLATE_SENTINEL,
} from './smokeLib';

const main = async (): Promise<void> => {
  console.log('smoke:flags: starting...');

  const repoRoot = await findRepoRoot(process.cwd());
  const smokeEnv = await loadSmokeEnv(repoRoot);
  const profile = smokeEnv.SMOKE_AWS_PROFILE ?? 'JGS-SSO';
  const keepArtifacts = shouldKeepArtifacts(smokeEnv);
  const secretId = makeSecretId();
  console.log(`smoke:flags: profile=${profile} secretId=${secretId}`);

  await assertSmokeFixturesPresent({ repoRoot });
  const fixtures = getAwsSecretsFixturePaths({ repoRoot });
  const expected = await readDotenvFileMap(fixtures.envAbs);

  try {
    // Ensure no private/global override exists before push, otherwise effective
    // provenance would become file:global:private and selection would exclude it.
    await rmrf(fixtures.localAbs);

    const rootArgs = ['--paths', SMOKE_AWS_SECRETS_FIXTURES_DIR_REL];
    const awsArgs = ['aws', '--profile', profile, '--login-on-demand'];

    // Push: select only keys whose effective provenance is file:global:public
    const pushRes = await runAwsSecretsManagerToolsCli({
      repoRoot,
      env: smokeEnv,
      argv: [
        ...rootArgs,
        ...awsArgs,
        'secrets',
        'push',
        '-s',
        secretId,
        '--from',
        'file:global:public',
      ],
    });
    expectCommandOk(pushRes, 'cli-flags: push');
    logCommandOk(pushRes, 'cli-flags: push');

    // Pull into global:private -> .env.local (bootstrapped from template)
    const pullRes = await runAwsSecretsManagerToolsCli({
      repoRoot,
      env: smokeEnv,
      argv: [
        ...rootArgs,
        ...awsArgs,
        'secrets',
        'pull',
        '-s',
        secretId,
        '--to',
        'global:private',
      ],
    });
    expectCommandOk(pullRes, 'cli-flags: pull');
    logCommandOk(pullRes, 'cli-flags: pull');

    const localText = await readText(fixtures.localAbs);
    assertContains(
      localText,
      SMOKE_TEMPLATE_SENTINEL,
      'expected .env.local to be bootstrapped from template and preserve comments',
    );
    for (const [k, v] of Object.entries(expected)) {
      assertContains(
        localText,
        `${k}=${v}`,
        `expected .env.local to contain ${k}=${v}`,
      );
    }

    // Delete without recovery
    const delRes = await runAwsSecretsManagerToolsCli({
      repoRoot,
      env: smokeEnv,
      argv: [
        ...rootArgs,
        ...awsArgs,
        'secrets',
        'delete',
        '-s',
        secretId,
        '--force',
      ],
    });
    expectCommandOk(delRes, 'cli-flags: delete');
    logCommandOk(delRes, 'cli-flags: delete');

    // Pull should now fail (secret missing)
    expectCommandFail(
      await runAwsSecretsManagerToolsCli({
        repoRoot,
        env: smokeEnv,
        argv: [
          ...rootArgs,
          ...awsArgs,
          'secrets',
          'pull',
          '-s',
          secretId,
          '--to',
          'global:private',
        ],
      }),
      'cli-flags: pull after delete',
    );
  } finally {
    if (!keepArtifacts) await rmrf(fixtures.localAbs);
  }

  console.log('smoke:flags: done.');
};

await main();
