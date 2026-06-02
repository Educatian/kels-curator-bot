# Operations

## Local Smoke Test

Run a no-token demo before connecting Discord:

```powershell
npm.cmd install
npm.cmd run seed:demo
npm.cmd run digest:demo
```

This seeds `data/posts.json` from `samples/kels-posts.json` and renders the Discord embed payload to the terminal.

## Discord Startup

```powershell
copy .env.example .env
npm.cmd run invite:url
npm.cmd run doctor
npm.cmd run setup:check
npm.cmd run guilds:list
npm.cmd run channels:list
npm.cmd run channels:verify
npm.cmd run register
npm.cmd start
```

Or create `.env` with local prompts:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\write-env.ps1
npm.cmd run invite:url
npm.cmd run doctor
npm.cmd run setup:check
npm.cmd run guilds:list
npm.cmd run channels:list
npm.cmd run channels:verify
npm.cmd run register
npm.cmd start
```

For a background Windows run with logs:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\go-live.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-bot.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\status-bot.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-bot.ps1
```

The bot needs these Discord permissions:

- Read Messages/View Channels
- Send Messages
- Use Slash Commands
- Read Message History

If automatic indexing is enabled, the application also needs the Message Content Intent in the Discord Developer Portal.

## Docker

```powershell
docker compose up -d --build
docker compose logs -f
```

Data persists in `./data`.

## Moderator Checklist

1. Run `/help-kels`.
2. Run `/backfill channel:#job_academic limit:100`.
3. Run `/backfill channel:#cfp-rfp limit:100`.
4. Run `/backfill channel:#seminar-resource limit:100`.
5. Run `/stats`.
6. Run `/health`.
7. Run `/post-digest category:all days:7 channel:#newsletter`.
8. Announce `/watch action:add keyword:<topic>` to members.
9. For public curation checks, run `npm.cmd run article:demo` and `npm.cmd run tech-signal:demo`.
10. For event automation, confirm `announcement` is in `INDEX_CHANNELS` and that event posts include date, time, and timezone.

## Privacy Defaults

- Private threads are not indexed by default.
- Only configured public channels/forums are indexed when `INDEX_CHANNELS` is set.
- Local storage keeps short message snippets and extracted metadata.
- Do not add sensitive/private channels to `INDEX_CHANNELS` without member notice.
- Role auto-tagging assigns only high-confidence existing roles; ambiguous matches and new-role ideas go to moderator review.
- Event reminders mention `@everyone` only for configured announcement-event reminders.
