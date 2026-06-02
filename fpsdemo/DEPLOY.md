# Deploying FPS Arena

Two pieces: the **game** (static Vite SPA → Vercel) and the **multiplayer room server**
(PartyKit → Cloudflare edge). Single-player works with just the front end; multiplayer
needs the PartyKit server.

## 1. Multiplayer server (PartyKit)

```bash
npm run party:deploy        # = partykit deploy  (first run prompts a login)
```

This deploys `party/arena.ts` and prints a host like:

```
fps-arena.<your-username>.partykit.dev
```

Copy that host — the front end needs it.

Local dev (run the game **and** the room server together — this is what makes
multiplayer work locally; `npm run dev` alone starts only the game):

```bash
npm run dev:all             # vite (game) + partykit dev (rooms) together
# or run them in two terminals:
npm run party:dev           # ws server on http://127.0.0.1:1999
npm run dev                 # game on http://localhost:5173
```

In dev the client auto-targets `localhost:1999`. If multiplayer shows
"○ connecting…" forever, the room server isn't running — use `npm run dev:all`.

**Sharing a room:** joining sets the URL to `…/?room=CODE`. Send that link (or
use the **Copy room link** button on the pause screen) and your friend lands on
the join screen with the code prefilled.

## 2. Game front end (Vercel)

Set the PartyKit host as a build-time env var so the client knows where the rooms live:

```bash
# .env (or Vercel → Project → Settings → Environment Variables)
VITE_PARTYKIT_HOST=fps-arena.<your-username>.partykit.dev
```

Then deploy:

```bash
npm i -g vercel
vercel --prod
```

…or push to GitHub and "Import Project" on vercel.com — it auto-detects Vite
(build `npm run build`, output `dist/`). `vercel.json` is already included.

## Notes

- In **dev**, the client defaults `VITE_PARTYKIT_HOST` to `localhost:1999`, so
  `npm run party:dev` + `npm run dev` is all you need locally.
- If `VITE_PARTYKIT_HOST` is unset in production, single-player still works; the
  multiplayer "Join Room" button just won't be able to connect.
- The leaderboard is per-browser (`localStorage`). A global online leaderboard would
  reuse the same PartyKit backend (add a persistent "scores" room).
