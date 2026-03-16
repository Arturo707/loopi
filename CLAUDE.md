# Claude Code Project Config

## gstack

Use the `/browse` skill from gstack for all web browsing tasks. Never use `mcp__claude-in-chrome__*` tools.

Available skills:

- `/browse` — headless browser (Playwright)
- `/plan-ceo-review` — CEO-level plan review
- `/plan-eng-review` — Engineering Manager plan review
- `/review` — code review
- `/ship` — release manager workflow
- `/retro` — retrospective

If gstack skills aren't working, run the following to build the binary and register skills:

```bash
cd .claude/skills/gstack && ./setup
```
