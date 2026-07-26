import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(here, '..');
const repoRoot = path.resolve(skillRoot, '..');
const benchmark = path.join(repoRoot, 'benchmarks/ordinary-model-floor/benchmark.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-ordinary-model-floor-'));

function writeJson(name, value) {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

function run(args) {
  return spawnSync(process.execPath, [benchmark, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('benchmark verifies one first-pass architecture candidate through semantic, renderer, and visual-review gates', () => {
  const caseFile = writeJson('web-runtime.case.json', {
    schema_version: 1,
    id: 'web-runtime-architecture',
    diagram_type: 'architecture',
    quality_profile: 'showcase',
    requirements: {
      node_ids: ['users', 'cdn', 'lb', 'api', 'db'],
      relationships: [
        { from: 'users', to: 'cdn' },
        { from: 'cdn', to: 'lb' },
        { from: 'lb', to: 'api' },
        { from: 'api', to: 'db' },
      ],
    },
  });
  const runFile = writeJson('web-runtime.run.json', {
    schema_version: 1,
    case_id: 'web-runtime-architecture',
    agent: 'fixture-agent',
    model: 'fixture-model',
    attempt: 1,
    visual_review: {
      status: 'passed',
      reviewer: 'fixture-reviewer',
      defects: [],
    },
  });
  const candidate = path.join(skillRoot, 'examples/web-app.architecture.json');

  const result = run(['verify', '--case', caseFile, '--candidate', candidate, '--run', runFile]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.benchmark, 'ordinary-model-floor');
  assert.equal(receipt.caseId, 'web-runtime-architecture');
  assert.deepEqual(receipt.run, {
    agent: 'fixture-agent',
    model: 'fixture-model',
    attempt: 1,
  });
  assert.equal(receipt.gates.semantic.ok, true);
  assert.deepEqual(receipt.gates.semantic.missingNodeIds, []);
  assert.deepEqual(receipt.gates.semantic.missingRelationships, []);
  assert.equal(receipt.gates.validation.ok, true);
  assert.equal(receipt.gates.validation.checksPassed, 9);
  assert.deepEqual(receipt.gates.validation.composition, { errors: 0, warnings: 0 });
  assert.deepEqual(receipt.gates.visualReview, {
    status: 'passed',
    reviewer: 'fixture-reviewer',
    defects: [],
  });
  assert.equal(receipt.firstPassUsable, true);
});

test('benchmark rejects a renderer-valid candidate that changes required technical roles or relationship labels', () => {
  const source = JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples/web-app.architecture.json'), 'utf8'));
  source.components.find((component) => component.id === 'cache').type = 'frontend';
  source.connections.find((connection) => connection.from === 'api' && connection.to === 'db').label = 'HTTP';
  const candidate = writeJson('semantic-drift.architecture.json', source);
  const caseFile = writeJson('semantic-drift.case.json', {
    schema_version: 1,
    id: 'semantic-drift-architecture',
    diagram_type: 'architecture',
    quality_profile: 'showcase',
    requirements: {
      nodes: [
        { id: 'cache', type: 'database' },
        { id: 'db', type: 'database' },
      ],
      relationships: [
        { from: 'api', to: 'cache', label: 'read-through' },
        { from: 'api', to: 'db', label: 'SQL' },
      ],
    },
  });
  const runFile = writeJson('semantic-drift.run.json', {
    schema_version: 1,
    case_id: 'semantic-drift-architecture',
    agent: 'fixture-agent',
    model: 'fixture-model',
    attempt: 1,
    visual_review: {
      status: 'passed',
      reviewer: 'fixture-reviewer',
      defects: [],
    },
  });

  const result = run(['verify', '--case', caseFile, '--candidate', candidate, '--run', runFile]);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.gates.validation.ok, true, 'the deterministic renderer should still accept this controlled drift');
  assert.equal(receipt.gates.semantic.ok, false);
  assert.deepEqual(receipt.gates.semantic.mismatchedNodes, [
    { id: 'cache', field: 'type', expected: 'database', actual: 'frontend' },
  ]);
  assert.deepEqual(receipt.gates.semantic.missingRelationships, [
    { from: 'api', to: 'db', label: 'SQL' },
  ]);
  assert.equal(receipt.firstPassUsable, false);
});

test('benchmark never accepts a visual pass without an identified reviewer', () => {
  const caseFile = writeJson('unreviewed.case.json', {
    schema_version: 1,
    id: 'unreviewed-architecture',
    diagram_type: 'architecture',
    quality_profile: 'showcase',
    requirements: {
      node_ids: ['users', 'api', 'db'],
      relationships: [{ from: 'api', to: 'db' }],
    },
  });
  const runFile = writeJson('unreviewed.run.json', {
    schema_version: 1,
    case_id: 'unreviewed-architecture',
    agent: 'fixture-agent',
    model: 'fixture-model',
    attempt: 1,
    visual_review: {
      status: 'passed',
      reviewer: '',
      defects: [],
    },
  });
  const candidate = path.join(skillRoot, 'examples/web-app.architecture.json');

  const result = run(['verify', '--case', caseFile, '--candidate', candidate, '--run', runFile]);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.gates.semantic.ok, true);
  assert.equal(receipt.gates.validation.ok, true);
  assert.deepEqual(receipt.gates.visualReview, {
    status: 'invalid',
    reviewer: null,
    defects: [],
    reason: 'passed visual review requires a non-empty reviewer identity',
  });
  assert.equal(receipt.firstPassUsable, false);
});

test('benchmark applies the same semantic and delivery seam to workflow, sequence, data-flow, and lifecycle candidates', () => {
  const cases = [
    {
      type: 'workflow',
      example: 'agent-tool-call.workflow.json',
      nodes: [{ id: 'approval', type: 'security' }, { id: 'tool', type: 'messagebus' }],
      relationships: [{ from: 'router', to: 'approval', label: 'needs approval?' }],
    },
    {
      type: 'sequence',
      example: 'cache-miss-request.sequence.json',
      nodes: [{ id: 'redis', type: 'database' }, { id: 'db', type: 'database' }],
      relationships: [{ from: 'redis', to: 'api', label: 'miss' }],
    },
    {
      type: 'dataflow',
      example: 'product-analytics.dataflow.json',
      nodes: [{ id: 'consent', type: 'security' }, { id: 'pii', type: 'security' }],
      relationships: [{ from: 'consent', to: 'pii', label: 'identity map' }],
    },
    {
      type: 'lifecycle',
      example: 'agent-run.lifecycle.json',
      nodes: [{ id: 'approval', type: 'waiting' }, { id: 'cancelled', type: 'failure' }],
      relationships: [{ from: 'approval', to: 'cancelled', variant: 'security' }],
    },
  ];

  for (const item of cases) {
    const caseId = `${item.type}-representative`;
    const caseFile = writeJson(`${caseId}.case.json`, {
      schema_version: 1,
      id: caseId,
      diagram_type: item.type,
      quality_profile: 'showcase',
      requirements: {
        nodes: item.nodes,
        relationships: item.relationships,
      },
    });
    const runFile = writeJson(`${caseId}.run.json`, {
      schema_version: 1,
      case_id: caseId,
      agent: 'fixture-agent',
      model: 'fixture-model',
      attempt: 1,
      visual_review: {
        status: 'passed',
        reviewer: 'fixture-reviewer',
        defects: [],
      },
    });
    const candidate = path.join(skillRoot, 'examples', item.example);

    const result = run(['verify', '--case', caseFile, '--candidate', candidate, '--run', runFile]);

    assert.equal(result.status, 0, `${item.type}: ${result.stderr || result.stdout}`);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.gates.semantic.ok, true, item.type);
    assert.equal(receipt.gates.validation.ok, true, item.type);
    assert.equal(receipt.firstPassUsable, true, item.type);
  }
});

test('benchmark report separates first-pass usable rate from semantic, validation, and visual-review failures by configuration', () => {
  const resultsFile = path.join(tmp, 'benchmark-results.jsonl');
  const rows = [
    {
      schemaVersion: 1,
      benchmark: 'ordinary-model-floor',
      caseId: 'architecture-runtime',
      run: { agent: 'codex', model: 'strong', attempt: 1 },
      gates: {
        semantic: { ok: true },
        validation: { ok: true },
        visualReview: { status: 'passed', reviewer: 'reviewer', defects: [] },
      },
      firstPassUsable: true,
    },
    {
      schemaVersion: 1,
      benchmark: 'ordinary-model-floor',
      caseId: 'sequence-cache-miss',
      run: { agent: 'codex', model: 'strong', attempt: 1 },
      gates: {
        semantic: { ok: true },
        validation: { ok: true },
        visualReview: { status: 'passed', reviewer: 'reviewer', defects: [] },
      },
      firstPassUsable: true,
    },
    {
      schemaVersion: 1,
      benchmark: 'ordinary-model-floor',
      caseId: 'architecture-runtime',
      run: { agent: 'opencode', model: 'ordinary', attempt: 1 },
      gates: {
        semantic: { ok: false },
        validation: { ok: true },
        visualReview: { status: 'passed', reviewer: 'reviewer', defects: [] },
      },
      firstPassUsable: false,
    },
    {
      schemaVersion: 1,
      benchmark: 'ordinary-model-floor',
      caseId: 'sequence-cache-miss',
      run: { agent: 'opencode', model: 'ordinary', attempt: 1 },
      gates: {
        semantic: { ok: true },
        validation: { ok: false },
        visualReview: { status: 'skipped', reviewer: null, defects: [] },
      },
      firstPassUsable: false,
    },
  ];
  fs.writeFileSync(resultsFile, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

  const result = run(['report', '--results', resultsFile]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.benchmark, 'ordinary-model-floor');
  assert.deepEqual(report.overall, {
    runs: 4,
    firstPassUsable: 2,
    firstPassUsableRate: 0.5,
    failureClusters: {
      semantic: 1,
      validation: 1,
      visualReview: 1,
    },
  });
  assert.deepEqual(report.byConfiguration, [
    {
      agent: 'codex',
      model: 'strong',
      runs: 2,
      firstPassUsable: 2,
      firstPassUsableRate: 1,
      failureClusters: { semantic: 0, validation: 0, visualReview: 0 },
    },
    {
      agent: 'opencode',
      model: 'ordinary',
      runs: 2,
      firstPassUsable: 0,
      firstPassUsableRate: 0,
      failureClusters: { semantic: 1, validation: 1, visualReview: 1 },
    },
  ]);
});

test('benchmark semantic requirements bind by accepted technical labels instead of forcing model-authored internal IDs', () => {
  const source = JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples/web-app.architecture.json'), 'utf8'));
  const rename = new Map([
    ['api', 'service-api-v1'],
    ['cache', 'redis-cache-v1'],
  ]);
  for (const component of source.components) component.id = rename.get(component.id) || component.id;
  for (const connection of source.connections) {
    connection.from = rename.get(connection.from) || connection.from;
    connection.to = rename.get(connection.to) || connection.to;
  }
  for (const view of source.meta.views || []) {
    view.focus = view.focus.map((id) => rename.get(id) || id);
  }
  for (const boundary of source.boundaries || []) {
    boundary.wraps = boundary.wraps.map((id) => rename.get(id) || id);
  }
  const candidate = writeJson('semantic-aliases.architecture.json', source);
  const caseFile = writeJson('semantic-aliases.case.json', {
    schema_version: 1,
    id: 'semantic-aliases-architecture',
    diagram_type: 'architecture',
    quality_profile: 'showcase',
    requirements: {
      nodes: [
        { key: 'api', labels: ['API', 'API Server'], type: 'backend' },
        { key: 'cache', labels: ['Redis', 'Redis Cache'], type: 'database' },
      ],
      relationships: [
        { from: 'api', to: 'cache', labels: ['read-through', 'cache read'] },
      ],
    },
  });
  const runFile = writeJson('semantic-aliases.run.json', {
    schema_version: 1,
    case_id: 'semantic-aliases-architecture',
    agent: 'fixture-agent',
    model: 'fixture-model',
    attempt: 1,
    visual_review: {
      status: 'passed',
      reviewer: 'fixture-reviewer',
      defects: [],
    },
  });

  const result = run(['verify', '--case', caseFile, '--candidate', candidate, '--run', runFile]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.gates.semantic.ok, true);
  assert.deepEqual(receipt.gates.semantic.bindings, {
    api: 'service-api-v1',
    cache: 'redis-cache-v1',
  });
  assert.equal(receipt.firstPassUsable, true);
});

test('checked-in benchmark suite covers all five diagram types without presenting reference fixtures as model evidence', () => {
  const manifest = path.join(repoRoot, 'benchmarks/ordinary-model-floor/manifest.json');

  const result = run(['check', '--manifest', manifest]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.benchmark, 'ordinary-model-floor');
  assert.equal(receipt.suiteId, 'ordinary-model-floor-v1');
  assert.equal(receipt.purpose, 'suite-integrity');
  assert.equal(receipt.evidenceEligible, false);
  assert.equal(receipt.caseCount, 5);
  assert.deepEqual(receipt.diagramTypes, [
    'architecture',
    'dataflow',
    'lifecycle',
    'sequence',
    'workflow',
  ]);
  assert.equal(receipt.cases.length, 5);
  for (const item of receipt.cases) {
    assert.equal(item.promptOk, true, item.caseId);
    assert.equal(item.semanticOk, true, item.caseId);
    assert.equal(item.validationOk, true, item.caseId);
  }
});

test('suite integrity rejects a long prompt that omits the attempt-1 file contract', () => {
  const sourceSuite = path.join(repoRoot, 'benchmarks/ordinary-model-floor');
  const incompletePrompt = path.join(tmp, 'incomplete-benchmark-prompt.md');
  fs.writeFileSync(
    incompletePrompt,
    `# Plausible but incomplete prompt\n\n${'Describe the requested system accurately. '.repeat(12)}`,
  );
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceSuite, 'manifest.json'), 'utf8'));
  manifest.cases = manifest.cases.map((entry, index) => ({
    ...entry,
    case: path.resolve(sourceSuite, entry.case),
    prompt: index === 0 ? incompletePrompt : path.resolve(sourceSuite, entry.prompt),
    reference_fixture: path.resolve(sourceSuite, entry.reference_fixture),
  }));
  const manifestFile = writeJson('prompt-contract.manifest.json', manifest);

  const result = run(['check', '--manifest', manifestFile]);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.cases.find((item) => item.caseId === 'web-runtime-architecture').promptOk, false);
});

test('benchmark fails closed with machine-readable errors for malformed JSON and mismatched run identity', () => {
  const caseFile = writeJson('identity.case.json', {
    schema_version: 1,
    id: 'identity-case',
    diagram_type: 'architecture',
    requirements: { node_ids: ['api'] },
  });
  const candidate = path.join(skillRoot, 'examples/web-app.architecture.json');
  const mismatchedRun = writeJson('identity.run.json', {
    schema_version: 1,
    case_id: 'different-case',
    agent: 'fixture-agent',
    model: 'fixture-model',
    attempt: 1,
    visual_review: { status: 'skipped', reviewer: null, defects: [] },
  });

  const mismatch = run(['verify', '--case', caseFile, '--candidate', candidate, '--run', mismatchedRun]);

  assert.equal(mismatch.status, 2, mismatch.stderr || mismatch.stdout);
  assert.equal(mismatch.stderr, '');
  assert.deepEqual(JSON.parse(mismatch.stdout), {
    schemaVersion: 1,
    benchmark: 'ordinary-model-floor',
    error: {
      code: 'RUN_CASE_MISMATCH',
      message: 'run case_id "different-case" does not match benchmark case "identity-case"',
    },
  });

  const malformedCandidate = path.join(tmp, 'malformed.architecture.json');
  fs.writeFileSync(malformedCandidate, '{ definitely not JSON\n');
  const validRun = writeJson('valid-identity.run.json', {
    schema_version: 1,
    case_id: 'identity-case',
    agent: 'fixture-agent',
    model: 'fixture-model',
    attempt: 1,
    visual_review: { status: 'skipped', reviewer: null, defects: [] },
  });

  const malformed = run(['verify', '--case', caseFile, '--candidate', malformedCandidate, '--run', validRun]);

  assert.equal(malformed.status, 2, malformed.stderr || malformed.stdout);
  assert.equal(malformed.stderr, '');
  const malformedReceipt = JSON.parse(malformed.stdout);
  assert.equal(malformedReceipt.error.code, 'INVALID_JSON');
  assert.match(malformedReceipt.error.message, /malformed\.architecture\.json/);
  assert.doesNotMatch(malformed.stdout, /SyntaxError|at JSON\.parse/);
});

test('benchmark report marks only a complete first-pass matrix as evidence and rejects duplicate runs', () => {
  const manifestFile = path.join(repoRoot, 'benchmarks/ordinary-model-floor/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const rows = manifest.cases.map((entry) => {
    const benchmarkCase = JSON.parse(fs.readFileSync(
      path.resolve(path.dirname(manifestFile), entry.case),
      'utf8',
    ));
    return {
      schemaVersion: 1,
      benchmark: 'ordinary-model-floor',
      caseId: benchmarkCase.id,
      run: { agent: 'fixture-agent', model: 'ordinary-model', attempt: 1 },
      gates: {
        semantic: { ok: true },
        validation: { ok: true },
        visualReview: { status: 'passed', reviewer: 'human-reviewer', defects: [] },
      },
      firstPassUsable: true,
    };
  });
  const completeResults = path.join(tmp, 'complete-results.jsonl');
  fs.writeFileSync(completeResults, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

  const complete = run(['report', '--results', completeResults, '--manifest', manifestFile]);

  assert.equal(complete.status, 0, complete.stderr || complete.stdout);
  const report = JSON.parse(complete.stdout);
  assert.equal(report.suiteId, 'ordinary-model-floor-v1');
  assert.equal(report.evidenceEligible, true);
  assert.deepEqual(report.coverage, [{
    agent: 'fixture-agent',
    model: 'ordinary-model',
    expected: 5,
    present: 5,
    missingCaseIds: [],
    unexpectedCaseIds: [],
    complete: true,
  }]);

  const duplicateResults = path.join(tmp, 'duplicate-results.jsonl');
  fs.writeFileSync(
    duplicateResults,
    `${[...rows, rows[0]].map((row) => JSON.stringify(row)).join('\n')}\n`,
  );

  const duplicate = run(['report', '--results', duplicateResults, '--manifest', manifestFile]);

  assert.equal(duplicate.status, 2, duplicate.stderr || duplicate.stdout);
  assert.equal(duplicate.stderr, '');
  assert.equal(JSON.parse(duplicate.stdout).error.code, 'DUPLICATE_RESULT');
});

test('benchmark documentation locks the fair-run and truthful-evidence contract', () => {
  const readme = fs.readFileSync(
    path.join(repoRoot, 'benchmarks/ordinary-model-floor/README.md'),
    'utf8',
  );

  for (const required of [
    'firstPassUsable',
    'same prompt',
    'same repository commit',
    'attempt 1',
    'no post-hoc edits',
    'Reference fixtures are not benchmark evidence',
    '`passed`',
    '`failed`',
    '`skipped`',
    'check --manifest',
    'verify --case',
    'report --results',
  ]) {
    assert.match(readme, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), required);
  }
});

process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
