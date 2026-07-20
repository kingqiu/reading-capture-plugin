# Skill Runtime Security and Dependency Audit

Status: active acceptance record  
Audit date: 2026-07-20  
Scope: the seven Codex Skills registered by the personal Reading Capture creation workflow

## 1. Runtime rule

A registry entry is not considered executable merely because its `SKILL.md` exists. The Runner must separately prove:

1. the immutable Skill artifact and manifest match the Task lock;
2. declared package/runtime dependencies are present at the locked versions;
3. only declared inputs and outputs are staged into the Attempt workspace;
4. shell network access and Codex web search match the Task's explicit research authorization;
5. no ambient environment secret is inherited unless the manifest names it as `env:VARIABLE_NAME`;
6. global Codex config, global Skills, project rules, connectors, apps, browser control and multi-agent dispatch are not inherited by an automated Attempt.

The Runner now enforces items 3–6 at launch. It passes a minimal process environment, ignores global Codex config and rules, disables undeclared interactive tool surfaces, and sets network/web-search from the Task authorization. Generic labels such as `optional-provider-tokens` are descriptive only and do not grant access to any environment variable.

## 2. Pinned-source findings

| Skill | Fixed source examined | Runtime/dependency findings | Current readiness |
|---|---|---|---|
| Writing Styles | `0e85e2f8b3b196f1ac1298c48f956467da3260fb` | Python 3 scripts use the standard library; no network or provider token is required for the writing and QA path | Ready; real managed install verified |
| Keke Social Card | `227316de72788a30c0452455ec9d917193fb2a22` | Node plus Playwright/Playwright Core 1.61.0 are locked. Chromium 149.0.7827.55, Playwright revision 1228 and the macOS ARM64 executable SHA-256 are fixed in the manifest; a mismatch deletes the untrusted browser runtime | Implementation and deterministic failure tests ready; real managed install pending because external execution review reported the current Codex usage limit |
| Deep Research Skills | `e5479f857f484cde13fe69d2f3ce8de7af193bc7`, subpath `skills/research-codex-zh` | Uses Codex web search and a local validator importing PyYAML | Ready on the current Runner: PyYAML 6.0.3 wheel is digest-locked, installed and import-tested |
| Last30Days | `249c7a4c040558a903d6838dee31012980d4946d` | Core requires Python 3 and Node. Optional routes can invoke `yt-dlp`, `ffmpeg`, `gh`, `npx`, browser-cookie readers, OS keychain/pass, many social APIs and many provider tokens. It also writes a local cache/database | Fail closed in four layers: disabled in research UI, task queue, managed installer and Runner preflight. V1 must define a narrow keyless route before any layer is reopened |
| Academic Research Suite | `16696ba231c1a4063d5abf40349dbf00e5a753b2`, subpath `skills/academic-research-suite` | Python manifests require `pyyaml`, `ruamel.yaml`, `jsonschema[format]`, `pypdf`, `defusedxml`; optional live verification uses Crossref, OpenAlex, Semantic Scholar, arXiv and optional tokens/email identifiers; optional cross-model upload is outside V1 | Ready for non-cross-model execution on the current Runner: 21 direct/transitive wheels are exact-version and digest locked, installed and direct imports tested |
| Baoyu Infographic | local-vendor digest `f3b5f2c7…` | Reads optional user preference files in the upstream interactive workflow and generates images through an image-generation capability | Creation Runner must ignore home preference lookup and use project-staged inputs only; image generation needs a dedicated provider contract |
| 两克伴“小小克”配图 | local-vendor digest `51d375e6…` | Uses image generation and writes ordered PNG assets; no provider environment token is declared by the Skill | Project staging is defined; image-generation provider contract and real failure injection remain |

## 3. Secret boundary

The Runner's parent process may contain unrelated credentials. An Attempt receives only operational variables such as `PATH`, `HOME`, locale, temporary directory, certificate/proxy settings and `CODEX_HOME`, plus manifest entries written exactly as `env:NAME`. Values are never copied into synchronized Task state, manifests, logs or receipts.

This is deliberately stricter than “the Skill supports optional tokens.” A concrete credential binding UI and machine-local secret store are required before Last30Days or Academic optional provider credentials can be used. The user's standing authorization to send project material removes repeated content-upload prompts for this workflow; it does not turn every machine credential into an implicit Skill grant.

## 4. Network boundary

For non-research Tasks, the Runner forces shell network access and Codex web search off. For an explicitly authorized research Task, both are on. The Attempt still runs in `workspace-write`, with only staged inputs and outputs named in its prompt and context manifest.

The current Codex CLI supports `sandbox_workspace_write.network_access` and the web-search feature override in its published configuration schema. Automated Attempts also use `approval_policy=never` so an unexpected sandbox escalation fails the Attempt instead of hanging behind an invisible prompt.

## 5. Remaining acceptance work

1. When external execution is available, run the exact Keke managed install once and compare the installed Chromium executable with the already pinned digest. Do not substitute another download path or silently loosen the manifest.
2. Add additional wheel sets before enabling a Runner with a different Python/OS/architecture. The verified set in this audit is Python 3.13 on macOS ARM64; an unmatched platform fails closed on wheel digest.
3. Define a Last30Days V1 route profile: allowed sources/domains, binaries, cache path and optional credentials; disable setup wizards, browser-cookie extraction, package-manager installation and keychain/pass discovery.
4. Define the image-generation provider boundary for Keke/Baoyu/小小克 visual Tasks and exercise it from the headless Runner.
5. The current suite proves that a real fixture subprocess cannot read an undeclared secret, non-research Codex launches force shell network and web search off, escaping paths are rejected, and only declared outputs can be promoted. A live Codex sandbox escape attempt remains an external acceptance exercise, not a prerequisite for treating the local implementation tests as complete.
