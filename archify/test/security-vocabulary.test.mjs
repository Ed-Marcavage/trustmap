import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { componentFill, componentText, SECURITY_COMPONENT_KINDS, CONNECTION_CLASSIFICATIONS } from '../renderers/shared/geometry.mjs';
import { renderSemanticSigil } from '../renderers/shared/utils.mjs';
import { deploymentOwnershipDiagnostics } from '../renderers/shared/engineering-profiles.mjs';

// trustmap Phase 1: the smart-contract security vocabulary.
//   node kinds      contract · actor · role · asset · oracle · offchain (+ inherited external)
//   boundary kinds  trust-boundary · privilege-domain · chain · upgrade-domain
//   connections     classification (call | delegatecall | value | read | event | message | untrusted-callback)
//                   guard (free text, the mechanism gating a crossing)
// Everything is additive on schema_version 1: inherited Archify documents keep
// rendering byte-for-byte, and the viewer reads the new facts from data attributes.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(skillRoot, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trustmap-security-vocabulary-'));
const cli = path.join(skillRoot, 'bin', 'archify.mjs');
const template = fs.readFileSync(path.join(skillRoot, 'assets', 'template.html'), 'utf8');
const example = path.join(skillRoot, 'examples', 'threat-model.architecture.json');

const SECURITY_BOUNDARY_KINDS = ['trust-boundary', 'privilege-domain', 'chain', 'upgrade-domain'];

function renderJson(mode, document, name) {
  const input = path.join(tmp, `${name}.json`);
  const output = path.join(tmp, `${name}.html`);
  fs.writeFileSync(input, JSON.stringify(document));
  const result = spawnSync(process.execPath, [
    path.join(skillRoot, `renderers/${mode}/render-${mode}.mjs`),
    input,
    output,
  ], { encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr, html: result.status === 0 ? fs.readFileSync(output, 'utf8') : '' };
}

function canonicalSvg(html) {
  return html.match(/<svg\b[\s\S]*?<\/svg>/)?.[0] || '';
}

function values(svg, attribute) {
  return [...svg.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))].map((match) => match[1]);
}

function minimalArchitecture(kind, extra = {}) {
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: `Kind ${kind}` },
    components: [
      { id: 'left', type: kind, label: 'Left', pos: [40, 100], size: [120, 60] },
      { id: 'right', type: 'external', label: 'Right', pos: [320, 100], size: [120, 60] },
    ],
    connections: [{ from: 'left', to: 'right', label: 'calls', ...extra }],
  };
}

test('shared kind maps and sigils cover every security kind without literal color', () => {
  assert.deepEqual(SECURITY_COMPONENT_KINDS, ['contract', 'actor', 'role', 'asset', 'oracle', 'offchain']);
  assert.deepEqual(CONNECTION_CLASSIFICATIONS, ['call', 'delegatecall', 'value', 'read', 'event', 'message', 'untrusted-callback']);
  for (const kind of SECURITY_COMPONENT_KINDS) {
    assert.equal(componentFill[kind], `c-${kind}`, kind);
    assert.equal(componentText[kind], `t-${kind}`, kind);
    const sigil = renderSemanticSigil(kind, { x: 6, y: 6 });
    assert.match(sigil, new RegExp(`data-semantic-sigil="${kind}"`), kind);
    assert.match(sigil, new RegExp(`class="semantic-sigil s-${kind}"`), kind);
    assert.doesNotMatch(sigil, /#[0-9a-f]{3,8}|rgba?\(/i, kind);
  }
});

test('the viewer template styles every security kind, boundary, lens chip, and radar dot', () => {
  for (const kind of SECURITY_COMPONENT_KINDS) {
    assert.match(template, new RegExp(`\\.c-${kind}\\s*\\{[^}]*fill: var\\(--[a-z]+-fill\\);[^}]*stroke: var\\(--[a-z]+-stroke\\);`), `.c-${kind}`);
    assert.match(template, new RegExp(`\\.t-${kind}\\s*\\{ fill: var\\(--[a-z]+-stroke\\); \\}`), `.t-${kind}`);
    assert.match(template, new RegExp(`svg \\.s-${kind}\\s*\\{ color: var\\(--[a-z]+-stroke\\); \\}`), `svg .s-${kind}`);
    assert.match(template, new RegExp(`\\.overview-map-node\\[data-kind="${kind}"\\]`), `radar ${kind}`);
    assert.match(template, new RegExp(`\\.semantic-lens-kind\\[data-kind="${kind}"\\]`), `lens ${kind}`);
  }
  for (const kind of SECURITY_BOUNDARY_KINDS) {
    assert.match(template, new RegExp(`\\.c-${kind}\\s*\\{[^}]*stroke-dasharray:`), `.c-${kind}`);
  }
  // Node Finder fallback and Lens labels know the new kinds; classification wins over kind heuristics.
  assert.match(template, /'contract', 'actor', 'role', 'asset', 'oracle', 'offchain'\];/);
  assert.match(template, /\.replace\(\/offchain\/gi, 'off-chain'\)/);
  assert.match(template, /edge\.getAttribute\('data-edge-classification'\)/);
  // No literal hex color was introduced for the aliased kinds: they reuse the seven inherited signals.
  const aliasBlock = template.slice(template.indexOf('.c-contract'), template.indexOf('.c-offchain') + 120);
  assert.doesNotMatch(aliasBlock, /#[0-9a-f]{3,8}/i);
});

test('every security kind validates and renders as a semantic node in architecture, workflow, sequence, and dataflow', () => {
  for (const kind of SECURITY_COMPONENT_KINDS) {
    const architecture = renderJson('architecture', minimalArchitecture(kind), `arch-${kind}`);
    assert.equal(architecture.status, 0, `${kind}: ${architecture.stderr}`);
    const svg = canonicalSvg(architecture.html);
    assert.ok(values(svg, 'data-node-kind').includes(kind), `${kind}: data-node-kind`);
    assert.match(svg, new RegExp(`class="c-${kind}"`), `${kind}: fill class`);
    assert.match(svg, new RegExp(`data-semantic-sigil="${kind}"`), `${kind}: sigil`);
    assert.ok(values(svg, 'data-legend-kind').includes(kind), `${kind}: auto legend row`);
  }

  // Workflow layout has strict column spacing; retype the bundled example instead of hand-placing nodes.
  const workflowDocument = JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples', 'agent-tool-call.workflow.json'), 'utf8'));
  workflowDocument.nodes[0].type = 'actor';
  workflowDocument.nodes[1].type = 'contract';
  workflowDocument.nodes[2].type = 'role';
  const workflow = renderJson('workflow', workflowDocument, 'workflow-security');
  assert.equal(workflow.status, 0, workflow.stderr);
  const workflowSvg = canonicalSvg(workflow.html);
  for (const kind of ['actor', 'role', 'contract']) {
    assert.ok(values(workflowSvg, 'data-node-kind').includes(kind), `workflow ${kind}`);
    assert.match(workflowSvg, new RegExp(`class="c-${kind}"`), `workflow fill ${kind}`);
  }

  const sequence = renderJson('sequence', {
    schema_version: 1,
    diagram_type: 'sequence',
    meta: { title: 'Flash loan in one transaction' },
    participants: [
      { id: 'attacker', type: 'actor', label: 'Caller' },
      { id: 'pool', type: 'contract', label: 'Pool' },
      { id: 'feed', type: 'oracle', label: 'Price feed' },
    ],
    messages: [
      { from: 'attacker', to: 'pool', y: 180, label: 'flashLoan()' },
      { from: 'pool', to: 'feed', y: 240, label: 'latestAnswer()' },
    ],
  }, 'sequence-security');
  assert.equal(sequence.status, 0, sequence.stderr);
  const sequenceSvg = canonicalSvg(sequence.html);
  for (const kind of ['actor', 'contract', 'oracle']) {
    assert.ok(values(sequenceSvg, 'data-node-kind').includes(kind), `sequence ${kind}`);
    assert.match(sequenceSvg, new RegExp(`class="c-${kind}"`), `sequence fill ${kind}`);
  }

  const dataflow = renderJson('dataflow', {
    schema_version: 1,
    diagram_type: 'dataflow',
    meta: { title: 'Value flow' },
    stages: [{ label: 'Enter' }, { label: 'Custody' }, { label: 'Exit' }],
    nodes: [
      { id: 'depositor', type: 'actor', label: 'Depositor', stage: 0, row: 0 },
      { id: 'vault', type: 'contract', label: 'Vault', stage: 1, row: 0 },
      { id: 'treasury', type: 'asset', label: 'Treasury', stage: 2, row: 0 },
    ],
    flows: [
      { from: 'depositor', to: 'vault', label: 'deposit' },
      { from: 'vault', to: 'treasury', label: 'fees' },
    ],
  }, 'dataflow-security');
  assert.equal(dataflow.status, 0, dataflow.stderr);
  const dataflowSvg = canonicalSvg(dataflow.html);
  for (const kind of ['actor', 'contract', 'asset']) {
    assert.ok(values(dataflowSvg, 'data-node-kind').includes(kind), `dataflow ${kind}`);
  }
});

test('boundary kinds render with their own frame class and radius; unknown kinds fail schema', () => {
  for (const kind of SECURITY_BOUNDARY_KINDS) {
    const document = minimalArchitecture('contract');
    document.boundaries = [{ kind, label: `${kind} scope`, wraps: ['left'] }];
    const rendered = renderJson('architecture', document, `boundary-${kind}`);
    assert.equal(rendered.status, 0, `${kind}: ${rendered.stderr}`);
    const svg = canonicalSvg(rendered.html);
    assert.match(svg, new RegExp(`data-composition-frame-kind="${kind}"[^>]*class="c-${kind}"`), `${kind}: frame`);
  }
  const bad = minimalArchitecture('contract');
  bad.boundaries = [{ kind: 'moat', label: 'nope', wraps: ['left'] }];
  const rejected = renderJson('architecture', bad, 'boundary-bad');
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /\/boundaries\/0\/kind/);
});

test('connections carry authored classification and guard as data attributes and reject unknown classifications', () => {
  const ok = renderJson('architecture', minimalArchitecture('contract', {
    classification: 'untrusted-callback',
    guard: 'nonReentrant · checks-effects-interactions',
  }), 'connection-facts');
  assert.equal(ok.status, 0, ok.stderr);
  const svg = canonicalSvg(ok.html);
  assert.match(svg, /data-edge-classification="untrusted-callback"/);
  assert.match(svg, /data-edge-guard="nonReentrant · checks-effects-interactions"/);
  // Both the path and the label group carry the facts so focus/preview can read either.
  assert.equal((svg.match(/data-edge-classification="untrusted-callback"/g) || []).length, 2);

  const plain = renderJson('architecture', minimalArchitecture('contract'), 'connection-plain');
  assert.equal(plain.status, 0, plain.stderr);
  assert.doesNotMatch(canonicalSvg(plain.html), /data-edge-classification|data-edge-guard/);

  const bad = renderJson('architecture', minimalArchitecture('contract', { classification: 'teleport' }), 'connection-bad');
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /\/connections\/0\/classification/);

  const empty = renderJson('architecture', minimalArchitecture('contract', { guard: '' }), 'connection-empty-guard');
  assert.notEqual(empty.status, 0);
  assert.match(empty.stderr, /\/connections\/0\/guard/);
});

test('unknown component kinds still fail schema with a path-prefixed message', () => {
  const rejected = renderJson('architecture', minimalArchitecture('validator-node'), 'kind-bad');
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /\/components\/0\/type/);
});

test('the deployment-ownership profile ignores trustmap boundary kinds and connection facts', () => {
  const document = minimalArchitecture('contract', { classification: 'call', guard: 'onlyOwner' });
  document.components[0].tag = 'core team';
  document.boundaries = [
    { kind: 'region', label: 'mainnet', wraps: ['left'] },
    { kind: 'security-group', label: 'private', wraps: ['left'] },
    // A trust boundary that the connection crosses without a label must not
    // trigger deployment-crossing-mechanism: it is not a deployment boundary.
    { kind: 'trust-boundary', label: 'in scope', wraps: ['left'] },
  ];
  document.connections = [{ from: 'left', to: 'right', label: 'HTTPS', classification: 'call', guard: 'onlyOwner' }];
  const diagnostics = deploymentOwnershipDiagnostics(document);
  assert.deepEqual(diagnostics.map((entry) => entry.code), []);
  document.connections = [{ from: 'left', to: 'right' }];
  document.boundaries = [{ kind: 'trust-boundary', label: 'in scope', wraps: ['left'] }];
  const codes = deploymentOwnershipDiagnostics(document).map((entry) => entry.code);
  assert.ok(!codes.includes('engineering/deployment-crossing-mechanism'), codes.join(','));
});

test('the bundled threat-model example passes showcase validation and is a checked-in golden', () => {
  const result = spawnSync(process.execPath, [cli, 'validate', 'architecture', example, '--quality', 'showcase', '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout || result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.checks.length, 9);
  assert.equal(receipt.composition.summary.errors, 0);
  assert.equal(receipt.composition.summary.warnings, 0);

  const document = JSON.parse(fs.readFileSync(example, 'utf8'));
  const kinds = new Set(document.components.map((component) => component.type));
  for (const kind of SECURITY_COMPONENT_KINDS) assert.ok(kinds.has(kind), `example uses ${kind}`);
  assert.deepEqual(new Set(document.boundaries.map((boundary) => boundary.kind)), new Set(['privilege-domain', 'trust-boundary']));
  for (const connection of document.connections) {
    assert.ok(CONNECTION_CLASSIFICATIONS.includes(connection.classification), `${connection.id}: classification`);
    assert.ok(typeof connection.guard === 'string' && connection.guard.length > 0, `${connection.id}: guard`);
  }

  for (const golden of [
    path.join(skillRoot, 'examples', 'threat-model-rendered.html'),
    path.join(repoRoot, 'examples', 'threat-model-rendered.html'),
  ]) {
    assert.ok(fs.existsSync(golden), `${golden} missing`);
    const html = fs.readFileSync(golden, 'utf8');
    assert.match(html, /data-composition-frame-kind="trust-boundary"/);
    assert.match(html, /data-edge-guard="onlyRole\(GUARDIAN\)"/);
    assert.match(html, /data-legend-kind="role"[^>]*/);
  }
});

process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
