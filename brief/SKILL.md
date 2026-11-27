---
name: brief
description: Use when the user asks for $brief, /brief, brief, $work-brief, work brief, 업무 브리핑, or 최근 3일 작업 정리 across registered projects, including current work, next actions, and decisions.
---

# Brief

Create a sourced snapshot of recent changes and current obligations. Run only for the current request; this skill does not schedule monitoring or resume work.

## Window and scope

- Default to the current day and preceding two **calendar** days in `Asia/Seoul`, from 00:00 on the first day through the actual query time. For example, on 2026-10-22 the start is 2026-10-20 00:00 KST. A user-specified window, time zone, or project scope takes precedence. Show the exact window and snapshot time.
- Find the project registry from the shared agent-skills config: `node ~/.claude/skills/htmlfy/scripts/config.cjs --get projectsJson` (env `AGENT_SKILLS_PROJECTS_JSON`/`AGENCY_PROJECTS_JSON` > `~/.config/agent-skills/config.json` > none). Use its registered IDs and paths even when invoked from another project. If no registry is configured (or htmlfy is not installed), brief only the current Git repository and say so in coverage. The operations repository (`--get agencyDir`), when set, holds the role, access, and ticket rules to follow. Respect each project's access and personal-work boundary; registration alone does not authorize access to private material. Do not invent or automatically register missing projects.
- Include work completed, failed, cancelled, or otherwise changed within the window. Also include currently active or blocked work, pending next actions, and open decisions even if they started earlier. A task that was merely unfinished during the window is **not** evidence of current progress.

## Gather the smallest sufficient evidence

1. Follow the operations repository's and each project's `AGENTS.md`, role, delegation, and access policies (for example, an intake secretary that delegates execution, or a single authorized writer for an external record system). Do not access an external record system (issue tracker, wiki, Notion, etc.) unless those policies authorize the current role. Without such policies, read only local repository evidence.
2. For each relevant registered project, read only applicable source `STATUS`, tickets, decisions, and recent local Git, remote Git, CI, or deployment evidence. Say when remote or deployment freshness was not checked. Use existing project records (for example a `tracker/` folder or an external record system) and relevant owner threads only as the policies allow. Start with existing checkpoints, dated deltas, and compact status summaries; open older or longer records only to settle a material ambiguity. Do not scan all past chats or treat chat silence as proof of inactivity.
3. Record the per-project `checked at` time, source links or paths, and coverage: **full**, **partial**, or **not checked**, with a reason for gaps. If a source cannot be reached, continue with available evidence and label the gap. Do not imply uninspected projects are clear.
4. Reconcile conflicts by source date and authority; keep contradictory facts visible when unresolved. Mark every uncertain claim as **inference**, **conflicting evidence**, **stale**, or **unavailable**. Preserve supplied verification, PR, SHA, CI, and deployment evidence as sourced facts at its stated level; lack of direct recheck alone is not evidence of nondeployment or ongoing implementation. Prefer the latest verified outcome over older task prose. Distinguish document completion, implementation, actual verification, deployment, external submission, and confirmed result. A receipt is not a confirmed external outcome; a local commit is not a deployment. If current state is absent, say **unconfirmed**; a completed document draft does not make the whole task complete or prove it remains to do.
5. Deduplicate by ticket and project, then classify: recent completion/change, currently in progress, blocked, next action, and open user decision. Give each item an owner and a concrete next step when known. For deadlines, distinguish **none stated** from **not checked**; never infer one from urgency.

## Publish and stop

- Put user decisions, urgent blockers, and at most three recommended priorities at the top. For decisions, state options, recommendation, impact, and real deadline if any. Do not re-ask for an approval already granted within scope or turn an agent's recommendation into a user decision.
- Use exactly two top-level sections, `핵심 요약` and `상세 내용`, following [the dashboard template](references/dashboard-template.md). The detail table must cover project, task/ticket, current status, recent change and evidence, owner, next action, and blocker or user decision. Include snapshot time and coverage in the detail section. A concise empty-state with coverage is better than invented work.
- The role the policies authorize may update the **existing** dashboard or report location and link original records. Do not create a permanent duplicate status ledger. Any write to an external record system requires read-back; on failure, follow the repository's fallback rule (if any) and label it unsynchronized.
- Scope ends at reading, summarizing, and updating the existing dashboard. Do not automatically restart stale tasks, change code, commit, push, deploy, publish externally, settle decisions, or create an automation. Record a recommended action for the proper owner instead. In the final report, mention Git commit/push/deployment only briefly when relevant. Do not measure or mention work time or tokens unless the user explicitly requested it.
