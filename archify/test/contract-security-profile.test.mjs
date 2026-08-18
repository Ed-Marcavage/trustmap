import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  contractSecurityDiagnostics,
  deploymentOwnershipDiagnostics,
  validateEngineeringProfile,
} from '../renderers/shared/engineering-profiles.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const cli = path.join(skillRoot, 'bin', 'archify.mjs');
const examplePath = path.join(skillRoot, 'examples', 'threat-model.architecture.json');
const example = JSON.parse(fs.readFileSync(examplePath, 'utf8'));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function only(diagnostics, code) {
  const matches = diagnostics.filter((entry) => entry.code === code);
  assert.equal(matches.length, 1, `${code}: ${JSON.stringify(diagnostics.map((entry) => entry.code))}`);
  return matches[0];
}

test('contract security profile passes the checked threat-model example and stays opt-in', () => {
  assert.equal(example.meta.engineering_profile, 'contract-security');
  assert.deepEqual(contractSecurityDiagnostics(example), []);
  assert.doesNotThrow(() => validateEngineeringProfile('architecture', example));

  const ordinary = clone(example);
  delete ordinary.meta.engineering_profile;
  ordinary.boundaries = [];
  ordinary.connections.forEach((connection) => { delete connection.guard; });
  assert.doesNotThrow(() => validateEngineeringProfile('architecture', ordinary));
});

test('the profile map refactor leaves deployment-ownership behavior unchanged', () => {
  const deploymentExample = JSON.parse(fs.readFileSync(
    path.join(skillRoot, 'examples', 'production-deployment.architecture.json'), 'utf8',
  ));
  assert.equal(deploymentExample.meta.engineering_profile, 'deployment-ownership');
  assert.deepEqual(deploymentOwnershipDiagnostics(deploymentExample), []);
  assert.doesNotThrow(() => validateEngineeringProfile('architecture', deploymentExample));
  const [entry] = deploymentOwnershipDiagnostics({ ...deploymentExample, boundaries: [] });
  assert.equal(entry.subject.profile, 'deployment-ownership');
});

test('a map without a trust boundary is reported, not passed', () => {
  const candidate = clone(example);
  candidate.boundaries = candidate.boundaries.filter((boundary) => boundary.kind !== 'trust-boundary');
  const diagnostics = contractSecurityDiagnostics(candidate);
  const missing = only(diagnostics, 'security/trust-boundary-missing');
  assert.equal(missing.subject.profile, 'contract-security');
  assert.equal(missing.subject.collection, 'boundaries');
  assert.deepEqual(missing.evidence, { requiredKind: 'trust-boundary', found: 0 });
});

test('every contract sits in exactly one trust boundary and every role in a privilege domain', () => {
  const unscoped = clone(example);
  const inScope = unscoped.boundaries.find((boundary) => boundary.label === 'In scope');
  inScope.wraps = inScope.wraps.filter((id) => id !== 'strategy');
  const strategyIndex = unscoped.components.findIndex((component) => component.id === 'strategy');
  const dropped = only(contractSecurityDiagnostics(unscoped), 'security/scope-ambiguous');
  assert.equal(dropped.subject.index, strategyIndex);
  assert.equal(dropped.subject.id, 'strategy');
  assert.deepEqual(dropped.evidence.memberships, []);

  const doubled = clone(example);
  doubled.boundaries.find((boundary) => boundary.label.startsWith('External')).wraps.push('strategy');
  const ambiguous = only(contractSecurityDiagnostics(doubled), 'security/scope-ambiguous');
  assert.equal(ambiguous.subject.id, 'strategy');
  assert.equal(ambiguous.evidence.memberships.length, 2);

  const unroled = clone(example);
  unroled.boundaries.find((boundary) => boundary.kind === 'privilege-domain').wraps = ['timelock'];
  const guardianIndex = unroled.components.findIndex((component) => component.id === 'guardian');
  const roleDiagnostic = only(contractSecurityDiagnostics(unroled), 'security/scope-ambiguous');
  assert.equal(roleDiagnostic.subject.index, guardianIndex);
  assert.equal(roleDiagnostic.evidence.requiredKind, 'privilege-domain');
});

test('removing one guard from a trust-boundary crossing yields exactly one diagnostic with the connection index', () => {
  const candidate = clone(example);
  const index = candidate.connections.findIndex((connection) => connection.id === 'supply');
  delete candidate.connections[index].guard;
  const diagnostics = contractSecurityDiagnostics(candidate);
  assert.equal(diagnostics.length, 1);
  const [crossing] = diagnostics;
  assert.equal(crossing.code, 'security/crossing-guard-missing');
  assert.equal(crossing.subject.collection, 'connections');
  assert.equal(crossing.subject.index, index);
  assert.equal(crossing.subject.id, 'supply');
  assert.equal(crossing.evidence.from, 'strategy');
  assert.equal(crossing.evidence.to, 'lending');
  assert.equal(crossing.evidence.crossedBoundaries.length, 2);
  assert.deepEqual(crossing.supportedFixes, [
    `set /connections/${index}/guard to the real crossing guard or the explicit literal none`,
  ]);
});

test('crossing math follows authored trust-boundary membership, and the literal none stays explicit', () => {
  const sameSide = clone(example);
  const invest = sameSide.connections.find((connection) => connection.id === 'invest');
  delete invest.guard;
  // vault -> strategy stays inside the same trust boundary; leaving the
  // upgrade-domain does not count as a trust crossing.
  assert.ok(!contractSecurityDiagnostics(sameSide)
    .some((entry) => entry.code === 'security/crossing-guard-missing'));

  const explicit = clone(example);
  explicit.connections.find((connection) => connection.id === 'deposit-redeem').guard = 'none';
  assert.deepEqual(contractSecurityDiagnostics(explicit), []);

  const blank = clone(example);
  blank.connections.find((connection) => connection.id === 'deposit-redeem').guard = '   ';
  assert.equal(only(contractSecurityDiagnostics(blank), 'security/crossing-guard-missing').subject.id, 'deposit-redeem');
});

test('privileged role edges name their entry point and guard', () => {
  const unlabeled = clone(example);
  const index = unlabeled.connections.findIndex((connection) => connection.id === 'guardian-pause');
  unlabeled.connections[index].label = '';
  const diagnostics = contractSecurityDiagnostics(unlabeled);
  assert.equal(diagnostics.length, 1);
  const [edge] = diagnostics;
  assert.equal(edge.code, 'security/privileged-edge-unscoped');
  assert.equal(edge.subject.index, index);
  assert.deepEqual(edge.evidence, { from: 'guardian', to: 'vault', missing: ['label'] });
  assert.deepEqual(edge.supportedFixes, [`set /connections/${index}/label to the gated entry point`]);

  // A guardless role edge is both an unscoped privileged edge and an unguarded
  // trust-boundary crossing; each independent rule reports its own missing fact.
  const unguarded = clone(example);
  delete unguarded.connections[index].guard;
  const codes = contractSecurityDiagnostics(unguarded).map((entry) => entry.code).sort();
  assert.deepEqual(codes, ['security/crossing-guard-missing', 'security/privileged-edge-unscoped']);
});

test('oracle reads name their staleness or deviation check', () => {
  const candidate = clone(example);
  const index = candidate.connections.findIndex((connection) => connection.id === 'read-price');
  delete candidate.connections[index].guard;
  const diagnostics = contractSecurityDiagnostics(candidate);
  const oracle = only(diagnostics, 'security/oracle-check-missing');
  assert.equal(oracle.subject.index, index);
  assert.deepEqual(oracle.evidence, { from: 'strategy', to: 'oracle', classification: 'read' });
  assert.deepEqual(oracle.supportedFixes, [
    `set /connections/${index}/guard to the staleness/deviation check or the explicit literal none`,
  ]);
  // The same edge also crosses the trust boundary; both facts are reported.
  only(diagnostics, 'security/crossing-guard-missing');

  // A call-classified edge into the oracle is not an oracle read.
  const call = clone(example);
  call.connections[index].classification = 'call';
  delete call.connections[index].guard;
  assert.ok(!contractSecurityDiagnostics(call)
    .some((entry) => entry.code === 'security/oracle-check-missing'));
});

test('an upgradeable component requires an upgrade-domain and a role admin edge', () => {
  const vaultIndex = example.components.findIndex((component) => component.id === 'vault');

  const undomained = clone(example);
  undomained.boundaries = undomained.boundaries.filter((boundary) => boundary.kind !== 'upgrade-domain');
  const missingDomain = only(contractSecurityDiagnostics(undomained), 'security/upgrade-admin-missing');
  assert.equal(missingDomain.subject.index, vaultIndex);
  assert.equal(missingDomain.subject.id, 'vault');
  assert.deepEqual(missingDomain.evidence.upgradeDomains, []);
  assert.ok(missingDomain.evidence.adminEdges.length > 0);
  assert.deepEqual(missingDomain.supportedFixes, ['add the component id to the real upgrade-domain boundary wraps list']);

  const unadmined = clone(example);
  unadmined.connections = unadmined.connections.filter((connection) => (
    connection.id !== 'guardian-pause' && connection.id !== 'timelock-upgrade'
  ));
  const missingAdmin = only(contractSecurityDiagnostics(unadmined), 'security/upgrade-admin-missing');
  assert.equal(missingAdmin.subject.id, 'vault');
  assert.deepEqual(missingAdmin.evidence.adminEdges, []);
  assert.deepEqual(missingAdmin.supportedFixes, ['add the real admin connection from the upgrading role into this component']);

  // The rule fires only on the explicit authored fact, never on tag or sublabel
  // heuristics: a proxy-looking component without upgradeable: true is silent.
  const untagged = clone(example);
  delete untagged.components[vaultIndex].upgradeable;
  untagged.boundaries = untagged.boundaries.filter((boundary) => boundary.kind !== 'upgrade-domain');
  assert.ok(!contractSecurityDiagnostics(untagged)
    .some((entry) => entry.code === 'security/upgrade-admin-missing'));
});

test('the upgradeable field is additive, boolean, and architecture-only', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-upgradeable-'));
  try {
    const bad = clone(example);
    bad.components.find((component) => component.id === 'vault').upgradeable = 'yes';
    const input = path.join(tmp, 'bad.architecture.json');
    fs.writeFileSync(input, JSON.stringify(bad));
    const result = spawnSync(process.execPath, [cli, 'validate', 'architecture', input, '--json'], {
      cwd: tmp,
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    const receipt = JSON.parse(result.stdout);
    assert.ok(receipt.diagnostics.some((diagnostic) => diagnostic.code === 'schema/type'
      && diagnostic.subject.path === '/components/3/upgradeable'), JSON.stringify(receipt.diagnostics));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('other diagram modes reject the architecture-only contract-security profile', () => {
  const fixtures = [
    ['workflow', 'agent-tool-call.workflow.json'],
    ['sequence', 'cache-miss-request.sequence.json'],
    ['dataflow', 'product-analytics.dataflow.json'],
    ['lifecycle', 'agent-run.lifecycle.json'],
  ];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-contract-security-schema-'));
  try {
    for (const [mode, fixture] of fixtures) {
      const candidate = JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples', fixture), 'utf8'));
      candidate.meta.engineering_profile = 'contract-security';
      const input = path.join(tmp, `${mode}.json`);
      fs.writeFileSync(input, JSON.stringify(candidate));
      const result = spawnSync(process.execPath, [cli, 'validate', mode, input, '--json'], {
        cwd: tmp,
        encoding: 'utf8',
      });
      assert.notEqual(result.status, 0, mode);
      const receipt = JSON.parse(result.stdout);
      assert.ok(receipt.diagnostics.some((diagnostic) => diagnostic.code === 'schema/additionalProperties'), mode);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('validate and deliver expose one truthful contract-security receipt', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-contract-security-'));
  try {
    const invalidPath = path.join(tmp, 'invalid.architecture.json');
    const invalid = clone(example);
    delete invalid.connections.find((connection) => connection.id === 'supply').guard;
    fs.writeFileSync(invalidPath, JSON.stringify(invalid, null, 2));

    const preservedOutput = path.join(tmp, 'preserved.html');
    const preservedBytes = Buffer.from('last known good threat model');
    fs.writeFileSync(preservedOutput, preservedBytes);
    const failedDelivery = spawnSync(process.execPath, [
      cli, 'deliver', 'architecture', invalidPath, preservedOutput, '--json',
    ], { cwd: tmp, encoding: 'utf8' });
    assert.notEqual(failedDelivery.status, 0);
    assert.equal(fs.readFileSync(preservedOutput).equals(preservedBytes), true);

    const failed = spawnSync(process.execPath, [cli, 'validate', 'architecture', invalidPath, '--json'], {
      cwd: tmp,
      encoding: 'utf8',
    });
    assert.notEqual(failed.status, 0);
    assert.equal(failed.stderr, '');
    const failure = JSON.parse(failed.stdout);
    assert.equal(failure.ok, false);
    assert.equal(failure.stage, 'render');
    assert.ok(failure.diagnostics.some((entry) => entry.code === 'security/crossing-guard-missing'));

    const validated = spawnSync(process.execPath, [cli, 'validate', 'architecture', examplePath, '--json'], {
      cwd: tmp,
      encoding: 'utf8',
    });
    assert.equal(validated.status, 0, validated.stderr);
    assert.equal(JSON.parse(validated.stdout).engineeringProfile, 'contract-security');

    const output = path.join(tmp, 'threat-model.html');
    const delivered = spawnSync(process.execPath, [cli, 'deliver', 'architecture', examplePath, output, '--json'], {
      cwd: tmp,
      encoding: 'utf8',
    });
    assert.equal(delivered.status, 0, delivered.stderr);
    const receipt = JSON.parse(delivered.stdout);
    assert.equal(receipt.validation.engineeringProfile, 'contract-security');
    assert.match(fs.readFileSync(output, 'utf8'), /data-engineering-profile="contract-security"/);

    const secondOutput = path.join(tmp, 'threat-model-second.html');
    const repeated = spawnSync(process.execPath, [
      cli, 'deliver', 'architecture', examplePath, secondOutput, '--json',
    ], { cwd: tmp, encoding: 'utf8' });
    assert.equal(repeated.status, 0, repeated.stderr);
    const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    assert.equal(digest(output), digest(secondOutput));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
