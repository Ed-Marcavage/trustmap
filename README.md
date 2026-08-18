# trustmap

**Trust-boundary maps and invariants for Solidity protocols — a security-focused fork of [Archify](https://github.com/tt-a1i/archify).**

trustmap turns a smart-contract repository (or a written protocol description) into a validated, interactive **threat-model map**: contracts, actors, privileged roles, assets, oracles, and off-chain participants; the trust boundaries between them; the guard on every boundary crossing; and the invariants that must hold — each pinned to `path:line` evidence. It ships as an agent skill for Claude Code, Cursor, Codex CLI, and OpenCode, and produces one self-contained HTML file per diagram.

![Version](https://img.shields.io/badge/version-3.0.0--dev.0-0891b2?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)
![Agent Skill](https://img.shields.io/badge/Agent-Skill-7C3AED?style=flat-square)

**Current development version:** `v3.0.0-dev.0` — forked from Archify v2.14.0 (upstream parity on `main` before Phase 1). The security specialization lands in phases; see [Status](#status).

## Why this fork exists

[Archify](https://github.com/tt-a1i/archify) (by [tt-a1i](https://github.com/tt-a1i), MIT) is an agent skill that turns a codebase or system description into a polished, interactive architecture, workflow, sequence, data-flow, or lifecycle diagram. Its design stance is unusual and exactly right for security work: every focus, route, reach query, story, and source link derives from **authored, verified facts** — the renderer never infers impact or risk, validation fails closed with a machine-readable repair receipt, and repository evidence is pinned to one exact commit.

Archify's *vocabulary*, however, is web infrastructure: `frontend`, `backend`, `database`, `cloud`, `messagebus`, `region`, `security-group`. A smart-contract audit needs a different set of nouns and a different set of rules. trustmap forks Archify to specialize it for **Solidity smart-contract security** (with a language-agnostic IR so other ecosystems can follow):

| Archify (upstream) | trustmap (this fork) |
|---|---|
| Component kinds: frontend, backend, database, cloud, security, messagebus, external | Adds `contract`, `actor`, `role`, `asset`, `oracle`, `offchain` |
| Boundaries: `region`, `security-group` | Adds `trust-boundary`, `privilege-domain`, `chain`, `upgrade-domain` |
| Connections carry a label and a visual variant | Adds `classification` (`call`, `delegatecall`, `value`, `read`, `event`, `message`, `untrusted-callback`) and `guard` (the access check on the crossing) |
| Fail-closed profile `deployment-ownership` (owners, regions, private state, crossing mechanism) | Adds `contract-security`: unguarded trust-boundary crossings, unscoped roles, assets without invariants, oracles without freshness checks, upgradeable contracts without an admin, unresolved invariant references — all reported as diagnostics, never silently passed |
| No structured notion of an invariant | First-class `invariants[]` (kind, strength, statement, `holds_for`, guards, `path:line` evidence, check method) referenced from components, connections, boundaries, and states |
| Repository evidence: GitHub URL + commit only | Adds local-git checkouts (Foundry/Hardhat) and verified-source evidence (chain id + address) |
| Guide recipes for web systems | Recipes for threat maps, privileged roles, value flow, attack-path sequences, protocol lifecycles, upgrade deltas |

Everything that makes Archify trustworthy stays as it is: hand-placed layout, deterministic routing and clearance rules, the structured-diagnostics validator, atomic `deliver`, the viewer runtime (search, focus, reach, route probe, lens, guided stories, exports), Architecture Delta, and the zero-dependency install.

### What trustmap is not

- **Not a vulnerability scanner.** It renders and validates facts; it does not find bugs. Facts come from your reading of the code, from analyzers, or from an agent skill that determines entry points and invariants — trustmap pins them to source and fails closed when one is missing.
- **Not an inference engine.** Authored reach is authored reach, never "blast radius"; an unguarded crossing is a diagnostic, never a finding.
- **Not a Mermaid beautifier or an auto-layout tool.** Layout judgment is part of the artifact (see upstream's [ROADMAP](ROADMAP.md) for the reasoning).

## What it produces

The flagship artifact is an `architecture`-mode **threat-model map** that answers five questions on one screen:

1. **Who can act?** — actors and privileged roles, each inside a privilege domain.
2. **What is trusted?** — in-scope vs. external, on-chain vs. off-chain, chain A vs. chain B, proxy admin vs. implementation.
3. **Where does value sit and move?** — assets and value-carrying connections.
4. **How is each crossing guarded?** — every trust-boundary crossing names its guard, or is explicitly `none`.
5. **What must always hold?** — invariants attached to the nodes, edges, boundaries, or states they constrain, with `path:line` evidence.

The other modes carry supporting views: `sequence` for one transaction over time (flash-loan-in-a-tx, callback re-entry, cross-chain message and acknowledgement), `lifecycle` for protocol state machines (auction, loan, proposal, vault epoch), `dataflow` for value flow, `workflow` for governance/upgrade/incident runbooks, and Architecture Delta for upgrade and re-audit diffs.

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Fork identity: rename, README, fork-appropriate release gates | done |
| 1 | Security vocabulary: node kinds, trust boundaries, `classification`/`guard` on connections, palettes and sigils, legend catalogs, tests, goldens, one hand-authored threat-model example ([`archify/examples/threat-model.architecture.json`](archify/examples/threat-model.architecture.json)) | in review — branch `phase-1/security-vocabulary` |
| 2 | Fail-closed `contract-security` engineering profile: trust-boundary presence, contract/role scoping, guarded crossings, scoped privileged edges, guarded oracle reads, upgrade admins for `upgradeable` components | in review — branch `phase-2/contract-security-profile` |
| 3 | First-class `invariants[]` + Semantic Passport section + adapter from a public pre-audit scan format | planned |
| 4 | Evidence union (local-git, verified-source), per-ecosystem extraction notes, guide recipes, SKILL.md rewrite | planned |
| 5 | Viewer polish: roles / unguarded-crossing lenses, invariant coverage filter | optional |

The working handoff for the next phase lives in [`HANDOFF.md`](HANDOFF.md) on the active phase branch.

## Install

The skill package is the inner [`archify/`](archify/) directory (kept under its upstream name for now so upstream changes merge cleanly; a rename is tracked in the handoff). No `npm install` is required to *use* it — the validators are committed and the CLI is dependency-free.

**Claude Code / Cursor / Codex CLI / OpenCode (manual copy):**

```bash
git clone https://github.com/Ed-Marcavage/trustmap.git
# Claude Code (global): ~/.claude/skills/trustmap
# Cursor / Codex (global): ~/.agents/skills/trustmap
# OpenCode: ~/.config/opencode/skills/trustmap
cp -R trustmap/archify ~/.claude/skills/trustmap
node ~/.claude/skills/trustmap/bin/archify.mjs doctor
```

Then ask your agent:

```text
Use trustmap to map this protocol's trust boundaries: contracts, actors, privileged roles,
assets, oracles, and off-chain keepers. Name the guard on every boundary crossing.
Put invariants in cards for now.
```

**Manual ZIP install:** [`archify.zip`](archify.zip) is the same package as a zero-dependency archive; extract it into your agent's skills directory.

## Quick start (CLI)

```bash
cd archify
node bin/archify.mjs doctor
node bin/archify.mjs guide "Map a lending protocol's roles, oracle dependency, and liquidation path"
node bin/archify.mjs validate architecture examples/threat-model.architecture.json --quality showcase --json
node bin/archify.mjs deliver  architecture examples/threat-model.architecture.json /tmp/threat-model.html --quality showcase --open --json
```

`validate` prints one JSON receipt with `diagnostics[]` (stable rule code, exact subject, measured evidence, supported fixes) on failure; `deliver` atomically replaces the target only after every check passes. The full authoring contract is [`archify/SKILL.md`](archify/SKILL.md).

## Choose the right diagram

| Type | trustmap use | Include in your prompt |
|---|---|---|
| **Architecture** | Threat-model map: contracts, actors, roles, assets, oracles, trust boundaries, guarded crossings | Scope, in-scope contracts, privileged roles, external dependencies, the primary value path |
| **Sequence** | One transaction over time: entry point → external calls → callbacks → state writes | Callers, callees, returns, where the untrusted call happens |
| **Lifecycle** | Protocol state machine with who may trigger each transition | States, events, timeouts, terminal outcomes |
| **Data Flow** | Value flow: where assets enter, accrue, and exit | Sources, sinks, custody changes, fee routes |
| **Workflow** | Governance / upgrade / incident runbooks | Participants, gates (timelock, multisig), branches |

## Relationship to upstream

- Forked from [tt-a1i/archify](https://github.com/tt-a1i/archify) at **v2.14.0** (`cffdd42`). Upstream history, changelog, roadmap, and design docs are preserved.
- License: MIT, unchanged. Upstream copyright notices are retained in [`LICENSE`](LICENSE); fork contributions are offered under the same license.
- Sync policy: schema changes are additive (`schema_version` stays `1`); the geometry engine, validator framework, delivery pipeline, and viewer core are left untouched so upstream fixes can be merged (`git remote add upstream https://github.com/tt-a1i/archify`).
- The GitHub Pages site under [`docs/`](docs/) is inherited from upstream and not yet rebranded; treat it as reference material.

## Development

```bash
cd archify
npm ci
npm test            # validators check, release identity, goldens, ~600 node:test cases
node scripts/render-examples.mjs && npm run render:examples   # regenerate packaged + repo-root goldens after template changes
node renderers/architecture/render-architecture.mjs examples/web-app.architecture.json ../examples/web-app.html
npm run build:gallery && npm run build:guide && npm run build:start   # inherited docs pages track the template and version
(cd .. && scripts/build-zip.sh)                                       # refresh the zero-dependency archive
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) (inherited) for the reproducible-bug expectations.

## Credits

Built on [Archify](https://github.com/tt-a1i/archify) by tt-a1i, itself based on Cocoon-AI's `architecture-diagram-generator`. Thank you for the engine and the discipline.
