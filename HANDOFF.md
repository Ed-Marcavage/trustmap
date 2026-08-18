# HANDOFF — trustmap (fork of tt-a1i/archify) — pick up after Phase 2

You are a fresh Claude Code session. Read this file top to bottom, then start with **"What to do next"**. Everything here is factual as of the Phase 2 PR; verify with the commands given before relying on it.

## What this project is

**trustmap** is a security-focused fork of [Archify](https://github.com/tt-a1i/archify) (MIT, forked at v2.14.0, commit `cffdd42`) that specializes Archify's typed-JSON → validated interactive HTML diagram pipeline for **Solidity smart-contract threat models**: contracts, actors, privileged roles, assets, oracles, off-chain participants; trust/privilege boundaries; the guard on every crossing; and (later phases) first-class invariants pinned to `path:line` evidence.

Ground rules that must hold in every phase:

- **General-purpose and public.** Do not import designs, prompts, or data from private/proprietary projects. Public OSS helpers may be used *directly*, with credit:
  - [pashov/skills](https://github.com/pashov/skills) (**MIT**) — `x-ray` (pre-audit scan: threat model, entry points, invariants, `architecture.json`), `fizz` (Echidna/Medusa fuzz suites), `solidity-auditor`. Vendoring a pinned copy as a sibling skill directory (keep their `LICENSE`, add `THIRD_PARTY_NOTICES.md` with source URL + commit + modifications, credit in README) or adapting their reference material into `references/` with a per-file "Adapted from … (MIT)" header are both fine. Preferred for Phase 3: vendor `x-ray` pinned so the adapter's input format is guaranteed; `fizz` stays a downstream consumer (reference only).
  - [trailofbits/skills](https://github.com/trailofbits/skills) (**CC-BY-SA-4.0**, ShareAlike) — usable as a companion install (`entry-point-analyzer`, `property-based-testing`) or vendored verbatim in a clearly separated directory under their license; do **not** paste or paraphrase their text into trustmap's MIT files (ShareAlike would apply). Their README asks that findings made with their skills say "Found using Trail of Bits Skills".
  - The renderer/validator itself never depends on these at `validate`/`deliver` time; the *skill workflow* orchestrates them ("no facts yet? run x-ray, import, then map").
- **Facts renderer, not a finder.** trustmap renders, validates, and pins *authored* facts. It never infers impact, risk, "blast radius", or vulnerabilities. Missing facts become diagnostics (fail-closed), never silent passes.
- **Additive IR, untouched engine.** `schema_version` stays `1`; every schema change is additive. `renderers/shared/geometry.mjs`, the composition gates, the diagnostics envelope, `validate`/`deliver`, and the viewer core stay upstream-mergeable (`git remote add upstream https://github.com/tt-a1i/archify`).
- **Solidity-first, language-agnostic IR.** Ecosystem specifics (Move, Solana/Anchor, Cairo, CosmWasm) belong in `references/` extraction guidance and adapters, never in the renderer.

Repository: https://github.com/Ed-Marcavage/trustmap · local clone: `…/repos/archify` (directory still named `archify`; remotes: `origin` = fork, `upstream` = tt-a1i/archify). The skill package is the inner `archify/` directory (kept under its upstream name for now — see open decisions).

The full plan with a file-by-file change map (line numbers against v2.14.0) is the "Archify Contract-Security Fork Map" artifact; its content is summarized in the phase table below.

## State of the repository

| Branch | Content |
|---|---|
| `main` | Fork identity commit `601dee9`: README rewritten, `README_EN.md`/`README_ZH.md` removed, SKILL.md `name: trustmap`, package renamed (`bin: trustmap`), `scripts/check-release-identity.mjs` reduced to the machine-facing identity contract, upstream-README-pinning test blocks trimmed, `readme-showcase` test + builder removed, `archify.zip` rebuilt. Rendering behavior identical to upstream v2.14.0. |
| `phase-1/security-vocabulary` | Phase 1 (PR #1). Version `3.0.0-dev.0`. Details below. |
| `phase-2/contract-security-profile` | Phase 2, stacked on phase-1 (PR base is `phase-1/security-vocabulary`; retarget to `main` once PR #1 merges). Version stays `3.0.0-dev.0`. Details below. |

### Phase 1 — what landed

- **Schemas (additive):** `schemas/common.schema.json` `componentType` += `contract, actor, role, asset, oracle, offchain`; new `connectionClassification` (`call, delegatecall, value, read, event, message, untrusted-callback`). `schemas/architecture.schema.json`: `boundaries[].kind` += `trust-boundary, privilege-domain, chain, upgrade-domain`; `connections[]` += `classification`, `guard` (1–120 chars); legend `entries` keys for the new kinds (also in `workflow.schema.json`). Validators regenerated (`npm run generate:validators`).
- **Renderers:** `renderers/shared/geometry.mjs` `componentFill`/`componentText` maps + exported `SECURITY_COMPONENT_KINDS`, `CONNECTION_CLASSIFICATIONS`; `renderers/shared/utils.mjs` sigils (`SIGIL_TONE`/`SIGIL_SHAPE`) for the six kinds; `renderers/architecture/render-architecture.mjs` legend catalog rows, `BOUNDARY_STYLE` table (`boundaryStyle(kind)` drives class/label class/radius, also for `compositionFrames`), `securityEdgeAttrs()` emits `data-edge-classification` / `data-edge-guard` on both the connection path and its label group; `renderers/workflow/render-workflow.mjs` legend catalog rows.
- **Viewer template (`assets/template.html`):** `.c-/.t-/svg .s-` classes for the six kinds (colors alias the seven inherited signals: actor→cyan, contract→green, asset→violet, role→rose, oracle→amber, offchain→orange — no new tokens, on purpose: the export's off-DOM theme probe resolves variables per theme block, so aliases would have to be repeated in all 9 palette blocks); boundary classes `.c-trust-boundary` (10,4,2,4 dash), `.c-privilege-domain` (2,3), `.c-chain` (14,4), `.c-upgrade-domain` (5,3) + blueprint dash normalization; radar + lens chip rules; Node Finder fallback list; `kindLabel()` maps `offchain` → "Off-chain"; `relationshipTokenKind()` prefers an authored `data-edge-classification` (`untrusted-callback`→security, `event|message`→event, `value|read`→data, else call) and extends kind heuristics (`role`→security, `offchain`→event, `asset|oracle`→data). Generator meta is now `trustmap 3.0.0-dev.0`.
- **Example:** `archify/examples/threat-model.architecture.json` — yield vault (depositor actor; guardian + timelock roles in a `privilege-domain`; vault + strategy contracts and a share asset inside a `trust-boundary` "In scope"; keeper, oracle, lending market, DEX router inside a `trust-boundary` "External — not trusted"; every connection carries `classification` + `guard`). Validates at showcase (9/9 checks, 0 composition errors/warnings), containment passes at 1440×900 → 2048×1320 (`visual-check`), and it is a golden (`threat-model-rendered.html` in both `archify/examples/` and `examples/`; `scripts/render-examples.mjs` + `test/golden.mjs` TARGETS include it).
- **Tests:** new `test/security-vocabulary.test.mjs` (8 tests: maps/sigils, template CSS/JS hooks, every kind renders in architecture/workflow/sequence/dataflow, boundary kinds + schema rejection, connection facts + rejections, deployment-ownership profile ignores trust boundaries, example showcase + goldens). Updated enum lists in `test/geometry.test.mjs`, `test/legend-contract.test.mjs` (workflow all-mode fixture viewBox widened to 1100 — see gotchas), `test/semantic-legend-gateway.test.mjs`. `test/golden.mjs`: landing-page version check dropped (inherited docs are frozen).
- **Docs:** SKILL.md (type router row, kinds/boundaries/connection facts in "Authoring invariants"), `references/authoring-contract.md` (enums + "Security vocabulary placement"), `schemas/README.md` (legend keys, shared defs, "Security vocabulary (trustmap)" section, all-mode note), README status/quick start, CHANGELOG `## [Unreleased]` with `Development identity: v3.0.0-dev.0`.
- **Regenerated:** goldens (both dirs), `examples/web-app.html`, `docs/gallery*` (manifest `archifyVersion` follows package version), `docs/guide.html`, `docs/start.html`, `archify.zip`.

Verification commands (all green at handoff): `cd archify && npm ci && npm test` (627 tests + release identity + goldens), `node bin/archify.mjs validate architecture examples/threat-model.architecture.json --quality showcase --json`, `node ../scripts/package-smoke.mjs` after `scripts/build-zip.sh`.

### Phase 2 — what landed

- **Profile engine:** `renderers/shared/engineering-profiles.mjs` — `validateEngineeringProfile` now dispatches through a `Map<profile, diagnosticsFn>` (`PROFILE_DIAGNOSTICS`); `subject()` takes the profile as its first argument; `deploymentOwnershipDiagnostics` is otherwise untouched. New exported `contractSecurityDiagnostics(diagram)` with six independent error rules: `security/trust-boundary-missing` (≥1 `trust-boundary`), `security/scope-ambiguous` (every `contract` in exactly one `trust-boundary`, every `role` in ≥1 `privilege-domain`), `security/crossing-guard-missing` (non-empty `guard` on every trust-boundary crossing; the literal `none` is explicit), `security/privileged-edge-unscoped` (`label` + `guard` on every role→contract edge), `security/oracle-check-missing` (`guard` on every `read`-classified edge into an `oracle`), `security/upgrade-admin-missing` (a component with `upgradeable: true` sits in an `upgrade-domain` and has an inbound role edge). Rules overlap deliberately (a guardless role edge that crosses a trust boundary yields two diagnostics). `security/asset-invariant-missing` was deferred to Phase 3 (needs `invariants[]`).
- **Schema (additive):** `meta.engineering_profile` enum += `contract-security`; components += optional `upgradeable: boolean` (authored fact, never inferred from tags/labels/names — the schema description says so). Validators regenerated.
- **Example:** `examples/threat-model.architecture.json` enables the profile, marks the vault `upgradeable: true`, and adds an `upgrade-domain` boundary `"UUPS"` wrapping the vault, nested inside "In scope" via pads (outer `pad: 48`, inner `pad: 24` — see gotchas). Still 9/9 showcase checks, 0 composition errors/warnings, visual-check pass; goldens regenerated in both dirs.
- **Tests:** new `test/contract-security-profile.test.mjs` (12 tests: golden pass + opt-in, deployment regression, one mutation per rule with exact subject indexes/evidence/fixes, `none`/whitespace guard semantics, no-inference check for `upgradeable`, boolean schema rejection, cross-mode rejection, truthful validate/deliver receipts + `data-engineering-profile` stamp + byte-identical redelivery + preserved bytes on failed delivery). `test/security-vocabulary.test.mjs` boundary-kind set assertion now includes `upgrade-domain`.
- **Docs:** `schemas/README.md` (contract-security section + `upgradeable`), `references/authoring-contract.md` + `SKILL.md` (never enable silently; never set `upgradeable` from tag heuristics), README status table, CHANGELOG Unreleased bullet. Gallery/guide/start untouched (no template or version change — they don't consume the threat-model example).

## Phase table

| Phase | Scope | State |
|---|---|---|
| 0 | Fork identity | done (`main`) |
| 1 | Security vocabulary: kinds, boundaries, `classification`/`guard`, palettes/sigils, legends, tests, goldens, threat-model example | done — PR #1 open |
| 2 | Fail-closed `contract-security` engineering profile | done — PR open, stacked on phase-1 |
| 3 | First-class `invariants[]` + Semantic Passport section + adapter from a public pre-audit scan format (pashov `x-ray` `architecture.json` / `invariants.md`) | **next** |
| 4 | Evidence union (`local-git`, `verified-source`), per-ecosystem extraction notes, guide recipes, SKILL.md rewrite | planned |
| 5 | Viewer polish: roles / unguarded-crossing lenses, invariant coverage filter | optional |

## What to do next — Phase 3: first-class `invariants[]`

Prerequisite: merge PR #1 (`phase-1/security-vocabulary` → `main`), retarget the Phase 2 PR to `main`, merge it, then branch `phase-3/invariants` off `main`. Enable Actions on the fork first if still pending, so PR checks run.

Goal (from the phase table and the fork-map artifact): a first-class, additive `invariants[]` section — kind, strength, statement, `holds_for`, guards, `path:line` evidence, check method — referenced from components, connections, boundaries, and states; a Semantic Passport section that renders them; and an adapter from a public pre-audit scan format (pashov `x-ray` `architecture.json` / `invariants.md`, MIT — the preferred route is vendoring a pinned copy, see the ground rules above). This unlocks the deferred `security/asset-invariant-missing` rule in `contractSecurityDiagnostics` (every `asset` and every `value`-classified edge covered by at least one invariant reference).

Ground the design in what exists before inventing anything: how `sources` + `--repo-root` evidence verification works today (`schemas/README.md` "Repository evidence", the Semantic Passport section of the viewer), and model diagnostics on the two existing profiles in `renderers/shared/engineering-profiles.mjs`. Keep `schema_version: 1` and every change additive; decide with the user whether invariant evidence in Phase 3 reuses the existing GitHub `repository` pin or waits for the Phase 4 evidence union (`local-git`, `verified-source`).

Definition of done: `npm test` green; the threat-model example (or a new fixture) carries at least one invariant with evidence; the passport renders it; the adapter converts a real public `x-ray` output; CHANGELOG + README updated; zip rebuilt; PR against `Ed-Marcavage/trustmap` `main` (use `gh pr create --repo Ed-Marcavage/trustmap --base main`; a bare `gh pr create` in a fork targets upstream tt-a1i/archify — do not do that).

## Gotchas learned in Phase 1

- **Goldens live in two places.** `node scripts/render-examples.mjs` (no arg) writes `archify/examples/`, `npm run render:examples` writes repo-root `examples/`; both are byte-compared by `test/golden.mjs`. `examples/web-app.html` (root) is a third copy rendered by hand: `node renderers/architecture/render-architecture.mjs examples/web-app.architecture.json ../examples/web-app.html`. Any template change ⇒ regenerate all three, plus `npm run build:gallery` (docs/gallery artifacts + manifest are compared against a fresh build), `npm run build:guide`, `npm run build:start` (version labels), then `scripts/build-zip.sh` (CI `zip-freshness` diffs the committed zip; `package-smoke` runs from it).
- **Version identity gate** (`scripts/check-release-identity.mjs`, fork version): package.json ↔ package-lock.json (root + `packages[""]`, name `trustmap`) ↔ SKILL.md `metadata.version` (major.minor) ↔ template `<meta name="generator" content="trustmap <version>">` ↔ README badge `version-<escaped>` + a line with `Current development version:` and `` `v<version>` `` ↔ CHANGELOG Unreleased bullets require a `dev.N` prerelease newer than the newest published core and the marker `` Development identity: `v<version>` ``. Bumping to the next dev identity (e.g. `3.0.0-dev.1`) touches all of those and forces the regeneration list above.
- **Workflow legend is one fixed baseline row** (`legendY = lastLaneBottom + 44`); a 13-entry `mode: all` legend at the default 720 width overflows with `legend/vertical-overflow`. `auto` mode is fine (one vocabulary per diagram). If this bites, make the workflow legend baseline row-count aware and grow `autoHeight` — a small renderer change, but check `legend-contract.test.mjs` "measured legends fail explicitly instead of wrapping" first.
- **Boundary labels sit at the frame's top-left** and are not part of the label-clearance gate; role edges entering a member from the top-left cross the label. Keep such labels short (the example uses "In scope").
- **Nested boundaries that share a top-left member collide at the label.** The label anchor is `(frameX + 8, frameY + 18)` with frame origin `member minX/minY − pad` (default pad 30, +20 extra at the bottom — bottom edge is pad-independent). Two boundaries whose leftmost/topmost member is the same node get identical frames and overlapping labels, and the inner frame's top border strikes the outer label. Separate them with pads: the threat-model example uses `pad: 48` on "In scope" and `pad: 24` on the "UUPS" upgrade-domain so the stack reads outer label → inner border → inner label → node, each with ≥4px clearance. Composition/showcase does not gate any of this — check it visually (`visual-check` + read the PNG).
- **`visual-check` writes evidence next to the HTML** (`*.visual-check.{json,html,png}` in `examples/`). Delete them before committing; only the rendered goldens are checked in.
- **Do not add hex colors to the template for the security kinds.** Classes reference the inherited `--<signal>-fill/-stroke` tokens directly; the export pipeline probes theme blocks off-DOM, so an alias custom property defined in only one block would leak the wrong theme into exports.
- **CI on the fork.** GitHub does not run workflows on a freshly forked repository until someone opens the fork's *Actions* tab and enables them ("I understand my workflows, go ahead and enable them"). At handoff, PR #1 shows no checks for that reason; `npm test`, the identity gate, and `package-smoke` were run locally and are green. Once enabled, `gh pr checks 1 --repo Ed-Marcavage/trustmap` shows the `test` matrix (Node 18/20/22/24), `webm-artifact`, `zip-freshness`, and the 3-OS `package-smoke`.
- Deprecated but harmless: `docs/` (inherited GitHub Pages site, still Archify-branded, regenerated for template freshness only), `integrations/deepseek-harness/` + `.github/workflows/dsh.yml` (upstream's DSH adapter), `.github/ISSUE_TEMPLATE/*` (upstream links), `test/real-repository-proof.test.mjs` (pins an external `mco-org/mco` commit; passes offline), `examples/archify-repo*.html`, `maka-architecture.html` (static showcase renders, untested).

## Open decisions (ask the user before acting)

1. **Rename the inner package directory `archify/` → `trustmap/`.** ~50 path references across `scripts/*.mjs`, `.github/workflows/*.yml`, `scripts/build-zip.sh`, `scripts/package-smoke.mjs`, README/docs commands, `check-release-identity.mjs`. Needed so `npx skills add Ed-Marcavage/trustmap` installs under `trustmap` and does not collide with an installed upstream `archify`. Mechanical but touches CI; do it as its own PR.
2. **Prune the inherited web kinds** (`frontend, backend, database, cloud, messagebus`) from the fork's vocabulary, or keep both vocabularies. Keeping both is what Phase 1 did (zero regressions, upstream-mergeable). Pruning means rewriting every upstream example/fixture/test.
3. **Docs site**: rebrand `docs/` for trustmap, or delete it and the gallery/guide/start builders + tests.
4. **`bin` filename** `bin/archify.mjs` — rename to `bin/trustmap.mjs` together with (1).

## Quick reference

```bash
cd archify
npm ci && npm test
node bin/archify.mjs doctor
node bin/archify.mjs validate architecture examples/threat-model.architecture.json --quality showcase --json
node bin/archify.mjs deliver  architecture examples/threat-model.architecture.json /tmp/threat-model.html --quality showcase --json
node bin/archify.mjs visual-check /tmp/threat-model.html --json          # needs Chrome; containment at 4 viewports
node scripts/render-examples.mjs && npm run render:examples             # goldens (both dirs)
node renderers/architecture/render-architecture.mjs examples/web-app.architecture.json ../examples/web-app.html
npm run build:gallery && npm run build:guide && npm run build:start
(cd .. && scripts/build-zip.sh && node scripts/package-smoke.mjs)
gh pr create --repo Ed-Marcavage/trustmap --base main --head <branch>   # never target upstream
```
