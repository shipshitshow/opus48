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

Local dev server (for testing before deploy):

```bash
npm run party:dev           # ws server on http://127.0.0.1:1999
```

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
