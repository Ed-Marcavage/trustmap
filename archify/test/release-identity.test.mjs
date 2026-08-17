import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

// trustmap fork: the release-identity gate covers the machine-facing identity
// contract only (package ↔ lockfile ↔ SKILL.md ↔ template generator ↔ README
// badge/marker ↔ CHANGELOG development identity). Upstream's bilingual README
// mirrors, Raven ZIP copy, landing/start pages, and ROADMAP marker are not part
// of the fork gate.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const checker = path.join(repoRoot, 'scripts', 'check-release-identity.mjs');

function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function runCheck(root) {
  return spawnSync(process.execPath, [checker, '--root', root], { encoding: 'utf8' });
}

function readmeFor(version, isDevelopment) {
  const escaped = version.replaceAll('-', '--');
  const label = isDevelopment ? 'Current development version:' : 'Current stable version:';
  return [
    `![Version](https://img.shields.io/badge/version-${escaped}-0891b2?style=flat-square)`,
    '',
    `**${label}** \`v${version}\``,
    '',
  ].join('\n');
}

function writeFixture(root, { version, generatorName = 'trustmap', unreleased = [], packageName = 'trustmap', skillName = 'trustmap', overrides = {} }) {
  const isDevelopment = version.includes('-');
  const [major, minor] = version.split('.');
  const files = {
    'archify/package.json': JSON.stringify({ name: packageName, version }),
    'archify/package-lock.json': JSON.stringify({ name: packageName, version, packages: { '': { name: packageName, version } } }),
    'archify/SKILL.md': `---\nname: ${skillName}\nmetadata:\n  version: "${major}.${minor}"\n---\n`,
    'archify/assets/template.html': `<meta name="generator" content="${generatorName} ${version}">`,
    'CHANGELOG.md': [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      ...(unreleased.length ? [`> Development identity: \`v${version}\`. Not a stable release.`, '', '### Added', ...unreleased, ''] : []),
      '## [2.14.0] — 2026-08-11',
      '',
      '### Added',
      '- Published upstream work.',
      '',
    ].join('\n'),
    'README.md': readmeFor(version, isDevelopment),
    ...overrides,
  };
  for (const [relativePath, content] of Object.entries(files)) writeFile(root, relativePath, content);
}

function withFixture(config, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trustmap-release-identity-'));
  try {
    writeFixture(root, config);
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('the live repository passes the fork release-identity gate', () => {
  const result = runCheck(repoRoot);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /release identity ok: trustmap \d+\.\d+\.\d+/);
});

test('a stable identity with an empty Unreleased section is coherent', () => {
  withFixture({ version: '2.14.0' }, (root) => {
    const result = runCheck(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /release identity ok: trustmap 2\.14\.0/);
  });
});

test('the inherited archify generator name is still accepted for the same version', () => {
  withFixture({ version: '2.14.0', generatorName: 'archify' }, (root) => {
    assert.equal(runCheck(root).status, 0);
  });
  withFixture({ version: '2.14.0', generatorName: 'archify', overrides: {
    'archify/assets/template.html': '<meta name="generator" content="archify 2.13.0">',
  } }, (root) => {
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /generator must be "trustmap 2\.14\.0"/);
  });
});

test('real Unreleased changes require a newer dev.N prerelease identity everywhere', () => {
  withFixture({ version: '2.14.0', unreleased: ['- Real unreleased work.'] }, (root) => {
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unreleased changes require a prerelease package version/);
  });
  withFixture({ version: '2.14.1-dev.0', unreleased: ['- Real unreleased work.'] }, (root) => {
    const result = runCheck(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /release identity ok: trustmap 2\.14\.1-dev\.0/);
  });
  withFixture({ version: '2.14.0-dev.0', unreleased: ['- Real unreleased work.'] }, (root) => {
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must be newer than published 2\.14\.0/);
  });
  withFixture({ version: '3.0.0-rc.1', unreleased: ['- Real unreleased work.'] }, (root) => {
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must use a dev\.N prerelease/);
  });
});

test('package, lockfile, Skill metadata, badge, and marker must agree', () => {
  withFixture({ version: '3.0.0-dev.0', unreleased: ['- Fork work.'], overrides: {
    'archify/package-lock.json': JSON.stringify({ name: 'trustmap', version: '2.14.0', packages: { '': { name: 'trustmap', version: '2.14.0' } } }),
  } }, (root) => {
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /package-lock\.json must match 3\.0\.0-dev\.0/);
  });
  withFixture({ version: '3.0.0-dev.0', unreleased: ['- Fork work.'], overrides: {
    'archify/SKILL.md': '---\nname: trustmap\nmetadata:\n  version: "2.14"\n---\n',
  } }, (root) => {
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /SKILL\.md metadata version 2\.14 must map to package 3\.0\.0-dev\.0 as 3\.0/);
  });
  withFixture({ version: '3.0.0-dev.0', unreleased: ['- Fork work.'], overrides: {
    'README.md': readmeFor('2.14.0', false),
  } }, (root) => {
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /README\.md must advertise development identity v3\.0\.0-dev\.0/);
  });
  withFixture({ version: '3.0.0-dev.0', unreleased: ['- Fork work.'], overrides: {
    'CHANGELOG.md': '# Changelog\n\n## [Unreleased]\n\n### Added\n- Fork work.\n\n## [2.14.0] — 2026-08-11\n',
  } }, (root) => {
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /CHANGELOG\.md Unreleased must declare Development identity: `v3\.0\.0-dev\.0`/);
  });
});

test('the fork identity rejects an unrenamed package or Skill', () => {
  withFixture({ version: '2.14.0', packageName: 'archify' }, (root) => {
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /package\.json name must be "trustmap"/);
  });
  withFixture({ version: '2.14.0', skillName: 'archify' }, (root) => {
    const result = runCheck(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /SKILL\.md frontmatter name must be trustmap/);
  });
});
