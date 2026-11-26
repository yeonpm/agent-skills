---
name: brief
description: Use when the user asks for $brief, /brief, brief, $work-brief, work brief, 업무 브리핑, or 최근 3일 작업 정리 across registered projects, including current work, next actions, and decisions.
---

# Brief

Create a sourced snapshot of recent changes and current obligations. Run only for the current request; this skill does not schedule monitoring or resume work.

## Window and scope

- Default to the current day and preceding two **calendar** days in `Asia/Seoul`, from 00:00 on the first day through the actual query time. For example, on 2026-10-22 the start is 2026-10-20 00:00 KST. A user-specified window, time zone, or project scope takes precedence. Show the exact window and snapshot time.
- Locate the Agency source at `/Users/you/yeonpm/ai-agency` (or its registered project path when moved), then use its `config/projects.json` for registered IDs and paths even when invoked from another project. Respect each project's access and personal-work boundary; registration alone does not authorize access to private material. Do not invent or automatically register missing projects.
- Include work completed, failed, cancelled, or otherwise changed within the window. Also include currently active or blocked work, pending next actions, and open decisions even if they started earlier. A task that was merely unfinished during the window is **not** evidence of current progress.

## Gather the smallest sufficient evidence

1. Follow the repository's `AGENTS.md`, role and access policies. The intake secretary delegates execution and receives the result. The assigned execution secretary is the single Notion writer. Other roles need their own user approval before **any** Notion access, including self checks; `notion_access=denied` by default. Before a Notion write, the authorized writer verifies self email against `config/notion.json` and handles `migration_pending` without old IDs.
2. For each relevant registered project, read only applicable source `STATUS`, tickets, decisions, and recent local Git, remote Git, CI, or deployment evidence. Say when remote or deployment freshness was not checked. Use the existing project Notion records and relevant owner threads only through an authorized role. Start with existing checkpoints, dated deltas, and compact status summaries; open older or longer records only to settle a material ambiguity. Do not scan all past chats or treat chat silence as proof of inactivity.
3. Record the per-project `checked at` time, source links or paths, and coverage: **full**, **partial**, or **not checked**, with a reason for gaps. If a source cannot be reached, continue with available evidence and label the gap. Do not imply uninspected projects are clear.
4. Reconcile conflicts by source date and authority; keep contradictory facts visible when unresolved. Mark every uncertain claim as **inference**, **conflicting evidence**, **stale**, or **unavailable**. Preserve supplied verification, PR, SHA, CI, and deployment evidence as sourced facts at its stated level; lack of direct recheck alone is not evidence of nondeployment or ongoing implementation. Prefer the latest verified outcome over older task prose. Distinguish document completion, implementation, actual verification, deployment, external submission, and confirmed result. A receipt is not a confirmed external outcome; a local commit is not a deployment. If current state is absent, say **unconfirmed**; a completed document draft does not make the whole task complete or prove it remains to do.
5. Deduplicate by ticket and project, then classify: recent completion/change, currently in progress, blocked, next action, and open user decision. Give each item an owner and a concrete next step when known. For deadlines, distinguish **none stated** from **not checked**; never infer one from urgency.

## Publish and stop

- Put user decisions, urgent blockers, and at most three recommended priorities at the top. For decisions, state options, recommendation, impact, and real deadline if any. Do not re-ask for an approval already granted within scope or turn an agent's recommendation into a user decision.
- Use exactly two top-level sections, `핵심 요약` and `상세 내용`, following [the dashboard template](references/dashboard-template.md). The detail table must cover project, task/ticket, current status, recent change and evidence, owner, next action, and blocker or user decision. Include snapshot time and coverage in the detail section. A concise empty-state with coverage is better than invented work.
- The authorized execution secretary may update the **existing** dashboard or report location and link original records. Do not create a permanent duplicate status ledger. Any Notion write requires read-back; on failure, follow the repository outbox rule and label it unsynchronized.
- Scope ends at reading, summarizing, and updating the existing dashboard. Do not automatically restart stale tasks, change code, commit, push, deploy, publish externally, settle decisions, or create an automation. Record a recommended action for the proper owner instead. In the final report, mention Git commit/push/deployment only briefly when relevant. Do not measure or mention work time or tokens unless the user explicitly requested it.
