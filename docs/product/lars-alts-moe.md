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
| POST | `/v1/lars/jobs` | Create and optionally start a job |
| GET | `/v1/lars/jobs` | List tenant jobs |
| GET | `/v1/lars/jobs/{job_id}` | Job detail + controller snapshot |
| POST | `/v1/lars/jobs/{job_id}/steps` | Run N ALTS steps |
| POST | `/v1/lars/jobs/{job_id}/pause` | Pause |
| POST | `/v1/lars/jobs/{job_id}/resume` | Resume |
| POST | `/v1/lars/jobs/{job_id}/cancel` | Cancel |
| POST | `/v1/lars/jobs/{job_id}/gates/{gate_id}` | Approve/reject attorney gate |

All endpoints require the existing Mercy tenant auth dependency and are tenant-isolated.

## Web surface

- Route: `/lars`
- Component: `mercy-legal-web/src/components/app/pages/lars-workspace-page.tsx`
- Navigation: attorney sidebar **LARS**

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
- Table `mercy_lars_jobs` is created automatically in local/SQLite or when `MERCY_AUTO_INIT_STORAGE_SCHEMA=true`.
- Production should apply schema through the same operator process used for other Mercy tables (or enable controlled schema init once).
- Office add-ins can call the same `/v1/lars/*` endpoints with the existing Microsoft/Mercy session token; no separate LARS auth path.
