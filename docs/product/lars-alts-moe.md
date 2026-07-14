# Mercy LARS and ALTS-MoE

## Terminology

| Name | Meaning |
| --- | --- |
| **Mercy LARS** | Legal Autonomous Research System — durable long-running legal assignment workflow |
| **Mercy ALTS** | Adaptive Legal Tree Search — inference-time research trajectory controller |
| **Mercy ALTS-MoE** | ALTS + existing Mixture-of-Experts orchestration |

## Division of responsibility

1. **ALTS** chooses the research trajectory (`EXPAND_WIDER`, `DEEPEN`, `CHALLENGE`, `REVISE`, `MERGE`, `PRUNE`, `PAUSE_FOR_ATTORNEY`, `SYNTHESIZE`, `VERIFY`, `COMPLETE`).
2. **MoE router** (`legal_task_router.moe_route`) chooses experts, models, tools, and capabilities for each node task.
3. **LangGraph agent network** executes expert ReACT cycles.
4. **Citation / guardrail / contradiction systems** determine whether work may complete.
5. **Attorneys** retain final control through durable approval gates.

## Backend modules

- `lars/models.py` — assignments, nodes, budgets, gates, authorities, contradictions
- `lars/assignment.py` — assignment compiler + validation
- `lars/evaluator.py` — structured branch scoring with deliverable weight profiles
- `lars/alts.py` — tree controller and action selection
- `lars/runtime.py` — job lifecycle, MoE bridge, step runner
- `lars/store.py` — durable PostgreSQL/SQLite table `mercy_lars_jobs` or local memory fallback

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/lars/status` | Capability and endpoint map |
| POST | `/v1/lars/assignments/compile` | Compile/validate assignment without starting |
| POST | `/v1/lars/jobs` | Create and start a job (short sync tick + background run) |
| GET | `/v1/lars/jobs` | List tenant jobs |
| GET | `/v1/lars/jobs/{job_id}` | Job detail, phase, tree, artifacts, budget, timeline |
| GET | `/v1/lars/jobs/{job_id}/tree` | ALTS tree snapshot |
| GET | `/v1/lars/jobs/{job_id}/nodes/{node_id}` | Node detail + permitted actions |
| POST | `/v1/lars/jobs/{job_id}/nodes/{node_id}/actions` | Attorney-directed ALTS actions |
| GET | `/v1/lars/jobs/{job_id}/events` | Event poll cursor |
| GET | `/v1/lars/jobs/{job_id}/events/stream` | SSE live stream (polling fallback still supported) |
| GET | `/v1/lars/jobs/{job_id}/sources` | Source usage tracing (ALTS path / claim / citation / work product) |
| POST | `/v1/lars/jobs/{job_id}/steps` | Run N ALTS steps |
| POST | `/v1/lars/jobs/{job_id}/run` | Schedule background continuation |
| POST | `/v1/lars/jobs/{job_id}/pause` | Pause |
| POST | `/v1/lars/jobs/{job_id}/resume` | Resume (+ background) |
| POST | `/v1/lars/jobs/{job_id}/cancel` | Cancel |
| POST | `/v1/lars/jobs/{job_id}/gates/{gate_id}` | Approve / reject / request revision |
| POST | `/v1/lars/jobs/{job_id}/contradictions/{id}/resolve` | Attorney contradiction decision |
| POST | `/v1/lars/jobs/{job_id}/notes` | Attorney notes |
| GET | `/v1/lars/jobs/{job_id}/office-insert` | Word insertion payload |
| POST | `/v1/lars/workers/recover` | Recover abandoned jobs (expired leases) |

List jobs supports optional `matter_id` and `status` query filters.

All endpoints require the existing Mercy tenant auth dependency and are tenant-isolated.
Cross-tenant job IDs return **404**.

## Depth / budget modes

| Mode | Intent |
| --- | --- |
| `focused` | Shallow tree, tight cost/time envelope |
| `standard` | Default production envelope |
| `deep` | Multi-hour exploration budget |
| `custom` | Explicit numeric overrides on the assignment payload |

## Long-running execution

- Jobs are **durable** in `mercy_lars_jobs` (Postgres/Supabase or local memory fallback).
- Create/resume/gate-approval run a short synchronous tick, then `schedule_background_run` continues outside the HTTP request.
- Background workers use **job leases + heartbeats** stored in job metadata; abandoned jobs can be recovered via `/v1/lars/workers/recover`.
- Web and Office clients **poll** job detail / events after refresh or reconnect; SSE is available at `/events/stream` with polling fallback.
- Multi-hour work must not depend solely on one open browser request or in-process thread lifetime across multi-instance deploys — prefer sticky workers or an out-of-process runner that claims leases from Postgres.

## Web surface (globally integrated — no standalone LARS product page)

Standalone `/lars` is **deleted** (not renamed to another product landing). There is no `/assignments` index and no LARS sidebar item. LARS is integrated into Mercy surfaces; job detail is contextual only:

| Surface | Integration |
| --- | --- |
| Assignment workspace | `/assignments/{job_id}` or `/matters/{matter_id}/assignments/{job_id}` — detail only (ALTS Research Map, authorities, review, work products) |
| Matter workspace | LARS Assignments tab + overview section |
| Chat / Mercy | **LARS Assignment** mode with shared composer, live progress, pause/resume/review |
| D.C. Research | Research results + **Continue as LARS Assignment** (preserves query/matter/sources/findings) |
| Vault | Source scope + start assignment from selected matter documents |
| History / dashboard | Assignment summaries and status counts |
| Shared components | `AssignmentComposer`, `AssignmentStatusCard`, `lars-labels.ts` |

- Component: `mercy-legal-web/src/components/app/pages/lars-workspace-page.tsx`
- Workflow: **Define → Plan → Explore → Synthesize → Verify → Attorney Review → Deliver**
- Visual system: Mercy indigo/slate design tokens (no separate parchment/burgundy LARS theme)

## Office add-in surface

- Word task pane panel: `mercy-legal-plugin/src/components/lars/LarsPanel.tsx`
- Job list, start assignment, phase/status, pending gates (approve/reject/revise), artifact list
- Insert executive summary, sections, citation table, open questions; replace selection; send selection to LARS
- Open assignment workspace `/assignments/{id}` or Matter-nested path (does **not** embed the ALTS graph in the task pane)

## Local verification

```powershell
$env:MERCY_ENV='local'
$env:MERCY_AUTH_MODE='dev'
$env:MERCY_AUTO_INIT_STORAGE_SCHEMA='true'
$tmp = Join-Path $env:TEMP "mercy-lars.db"
$env:POSTGRES_URL="sqlite+pysqlite:///$($tmp.Replace('\','/'))"
py -3 -m unittest tests.test_lars_alts -v
```

## Hosted notes

- Persistent jobs require `POSTGRES_URL` / Supabase Postgres.
- Hosted migration: `mercy-legal-web/supabase/migrations/202607140001_mercy_lars_jobs.sql`
- Table `mercy_lars_jobs` is also created automatically in local/SQLite or when `MERCY_AUTO_INIT_STORAGE_SCHEMA=true`.
- Production should apply the migration through the same Supabase/operator process used for other Mercy tables.
- Office add-ins call the same `/v1/lars/*` endpoints with the existing Microsoft/Mercy session token; no separate LARS auth path.

## Security

- Tenant isolation on every read/write (`tenant_id` match or 404)
- Matter scoping on create when `matter_id` is supplied
- Attorney gate decisions and overrides are persisted with actor + timestamp
- Stale-approval protection when artifacts change after a prior decision stamp
- No provider credentials in browser or Office code
- Attorney review language on deliverables and Office inserts
