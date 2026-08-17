#!/usr/bin/env node

// trustmap release-identity gate.
//
// Fork note: upstream Archify tied this gate to its bilingual README mirrors,
// the GitHub Pages landing/start pages, the Raven ZIP install copy, and the
// ROADMAP marker. trustmap keeps only the machine-facing identity contract:
// package.json ↔ package-lock.json ↔ SKILL.md metadata version ↔ renderer
// template generator meta ↔ README badge/marker ↔ CHANGELOG development
// identity. The inherited docs/ site is frozen reference material and is not
// part of the gate.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootFlag = process.argv.indexOf('--root');
const repoRoot = rootFlag === -1 ? scriptRoot : path.resolve(process.argv[rootFlag + 1] || '');
const failures = [];

const PRODUCT_NAME = 'trustmap';
const GENERATOR_NAMES = new Set([PRODUCT_NAME, 'archify']);

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  try {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    fail(`${relativePath} is missing or unreadable.`);
    return '';
  }
}

function readJson(relativePath) {
  const source = read(relativePath);
  if (!source) return {};
  try {
    return JSON.parse(source);
  } catch {
    fail(`${relativePath} is not valid JSON.`);
    return {};
  }
}

function compareCore(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function shieldEscape(value) {
  return value.replaceAll('_', '__').replaceAll('-', '--');
}

function checkReadme(relativePath, source, version, isDevelopment) {
  const badge = `/badge/version-${shieldEscape(version)}-`;
  const markerLabel = isDevelopment ? 'Current development version:' : 'Current stable version:';
  const identity = isDevelopment ? 'development' : 'stable';
  const hasMarker = source.split('\n').some((line) => line.includes(markerLabel) && line.includes(`\`v${version}\``));
  if (!source.includes(badge) || !hasMarker) {
    fail(`${relativePath} must advertise ${identity} identity v${version} with an exact escaped badge and explicit ${identity} marker.`);
  }
}

const packageJson = readJson('archify/package.json');
const changelog = read('CHANGELOG.md');
const unreleasedStart = changelog.search(/^## \[Unreleased\][^\n]*(?:\n|$)/m);
const afterUnreleased = unreleasedStart === -1
  ? ''
  : changelog.slice(unreleasedStart).replace(/^## \[Unreleased\][^\n]*(?:\n|$)/, '');
const nextRelease = afterUnreleased.search(/^## \[/m);
const unreleased = nextRelease === -1 ? afterUnreleased : afterUnreleased.slice(0, nextRelease);
const hasRealUnreleasedChanges = /^\s*-\s+\S/m.test(unreleased);
const version = packageJson.version;
const semver = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
const isDevelopment = Boolean(semver?.[4]);

if (packageJson.name !== PRODUCT_NAME) {
  fail(`archify/package.json name must be ${JSON.stringify(PRODUCT_NAME)}; found ${JSON.stringify(packageJson.name)}.`);
}

if (!semver) {
  fail(`package version is not a supported SemVer identity: ${JSON.stringify(version)}`);
} else if (hasRealUnreleasedChanges && !semver[4]) {
  fail(`Unreleased changes require a prerelease package version; found stable ${version}.`);
}

if (semver && hasRealUnreleasedChanges) {
  if (semver[4] && !/^dev\.\d+$/.test(semver[4])) {
    fail(`Unreleased development identity must use a dev.N prerelease; found ${version}.`);
  }
  const published = [...changelog.matchAll(/^## \[(\d+)\.(\d+)\.(\d+)\]/gm)]
    .map((match) => match.slice(1, 4).map(Number));
  const newestPublished = published.sort((left, right) => compareCore(right, left))[0];
  const currentCore = semver.slice(1, 4).map(Number);
  if (newestPublished && compareCore(currentCore, newestPublished) <= 0) {
    fail(`Unreleased package core ${currentCore.join('.')} must be newer than published ${newestPublished.join('.')}.`);
  }
}

if (semver) {
  const lock = readJson('archify/package-lock.json');
  if (lock.version !== version || lock.packages?.['']?.version !== version) {
    fail(`archify/package-lock.json must match ${version} at the root and packages[""].`);
  }
  if (lock.name !== PRODUCT_NAME || lock.packages?.['']?.name !== PRODUCT_NAME) {
    fail(`archify/package-lock.json must name the package ${JSON.stringify(PRODUCT_NAME)} at the root and packages[""].`);
  }

  const skill = read('archify/SKILL.md');
  const skillName = skill.match(/^name:\s*([^\s]+)\s*$/m)?.[1];
  if (skillName !== PRODUCT_NAME) {
    fail(`archify/SKILL.md frontmatter name must be ${PRODUCT_NAME}; found ${skillName || '(missing)'}.`);
  }
  const skillVersion = skill.match(/^\s*version:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1];
  const expectedSkillVersion = `${semver[1]}.${semver[2]}`;
  if (skillVersion !== expectedSkillVersion) {
    fail(`archify/SKILL.md metadata version ${skillVersion || '(missing)'} must map to package ${version} as ${expectedSkillVersion}.`);
  }

  const rendererTemplate = read('archify/assets/template.html');
  const generators = [...rendererTemplate.matchAll(/<meta\s+name="generator"\s+content="([a-z]+)\s+([^"]+)"\s*\/?>/g)]
    .map((match) => ({ name: match[1], version: match[2] }));
  if (generators.length !== 1 || !GENERATOR_NAMES.has(generators[0].name) || generators[0].version !== version) {
    const found = generators.map((entry) => `${entry.name} ${entry.version}`).join(', ') || '(missing)';
    fail(`archify/assets/template.html generator must be "${PRODUCT_NAME} ${version}" (or the inherited "archify ${version}"); found ${found}.`);
  }

  checkReadme('README.md', read('README.md'), version, isDevelopment);

  const changelogMarker = `Development identity: \`v${version}\``;
  if (hasRealUnreleasedChanges && !unreleased.includes(changelogMarker)) {
    fail(`CHANGELOG.md Unreleased must declare ${changelogMarker}.`);
  }
}

if (failures.length > 0) {
  for (const message of failures) console.error(`release identity: ${message}`);
  process.exit(1);
}

console.log(`release identity ok: ${PRODUCT_NAME} ${version}`);
