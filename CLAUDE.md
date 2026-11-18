# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- Path-scoped reminders load automatically from `.claude/rules/` (UI, ingestion/DB). They point to the docs; the docs are authoritative.
- Use Plan Mode for changes that touch several layers (schema + ingest + UI) or redesign a page; get the plan agreed before editing.
- UI work is not done until it has been looked at: use the `verify-ui` skill (`.claude/skills/verify-ui/`) and read the screenshots.
- `.claude/settings.json` allows the routine checks and denies reading `.env` files and destructive Prisma commands. Live ingestion (`npm run ingest`) asks first because it contacts a third-party service.
- Personal preferences go in `CLAUDE.local.md` or `.claude/settings.local.json` (both gitignored).
- Never deploy, push, or change production data/secrets without explicit approval in the conversation.
