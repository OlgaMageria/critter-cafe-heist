# 🐭🥐 Critter Cafe Heist (one room: the Kitchen)

A co-op coffee-break game for remote teams. 1 to 15 players, about 4 minutes per round.
One player is the **Runner**, a tiny critter (the animal they picked) sneaking through a cafe kitchen at night.
Everyone else is a **specialist with a private screen**, and you only win by talking (on Google Meet).

## Run it

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start
```

Open `http://localhost:3000` on your laptop. That is your own copy of the game.

## Let remote teammates join

Your laptop is not reachable from the internet, so you need a tunnel that gives you a public link.
Keep `npm start` running, open a second terminal, and use ONE of these:

- **Cloudflare quick tunnel** (no account): install `cloudflared`, then run
  `cloudflared tunnel --url http://localhost:3000`
  It prints a `https://something.trycloudflare.com` link.
- **ngrok** (free account): `ngrok http 3000`
- **VS Code**: Ports tab, forward port 3000, set visibility to Public.

Paste the link into the Meet chat. Everyone opens it, picks a name and an animal, and the first person in
(the 👑 host) clicks **Start the heist!**.

If everyone is on the same office network you can also share the `Same network` address printed by `npm start`.

## Host it online for free (no tunnel, no laptop needed)

Good if a tunnel link is blocked for some teammates. This uses a free [Render](https://render.com) web service.

1. Put the project on GitHub: create a free account, click **New repository** (private is fine), then **uploading an existing file**,
   and drag in everything from this folder **except** `node_modules` (`public/`, `test/`, `server.js`, `clues.js`, `package.json`, `README.md`, `.gitignore`).
2. On Render: **New > Web Service**, connect your GitHub account, pick the repository.
3. Set **Language** = `Node`, **Build Command** = `npm install`, **Start Command** = `npm start`, and choose the **Free** instance type.
4. Click deploy. When it is live, Render shows your link (`https://something.onrender.com`). That is the link for your team.
5. To update the game later: upload the changed files to GitHub. Render redeploys by itself after a couple of minutes.

Free-tier facts: the service sleeps after 15 minutes without visitors and takes about a minute to wake up, so open the link a few minutes
before the game. The waiting room is kept in memory, so it is empty after a restart. The page shows "Game version x.y.z" in the waiting room,
so you can always check which version is running.

## How a round works

| Role | Sees | Does NOT know |
| --- | --- | --- |
| **Runner** | only a small flashlight circle | where things are, which cupboard is right, where the guard is |
| 📜 **Clue Keeper** | clues about which cupboard hides the 🥐 | the map |
| 🗺️ **Mapper** | the whole kitchen + the Runner's live position | which cupboard is right |
| 🔭 **Lookout** | the guard cat's patrol route and/or live view cone | where the Runner is |

1. The croissant hides in one of **6 colored cupboards**. The Clue Keepers hold 2 or 3 short clues (like "it is right next to the sink" or "it is NOT the red cupboard"). The Mapper knows which cupboard is next to what, so clues and map have to be combined. Guide the Runner there and press **Space / E**.
   Don't brute-force it: a wrong cupboard is noisy (**+25 alarm**) and puts the guard cat on **alert for 8 seconds** (faster, fewer pauses, longer view).
2. Grab the 🥐, then sneak to the **EXIT** door on the left.
3. The cat sees you if you stand in its red view cone with a clear line of sight. Hide inside a 📦 box and it can't.
4. The alarm fills while you are seen and cools down slowly (2% per second) when you are not. Alarm at 100%, or the 4:00 timer running out, and you lose.

Roles rotate every round ("Next round" button). With 3 players: Runner, Clue Keeper, Mapper+Lookout.
With 1 player (solo test) you are the Runner and also see every specialist screen.
With more than 3 specialists, clues and map labels are split between players, so they have to talk even more.

## Controls (Runner)

WASD or arrow keys to move, Space or E to open a cupboard. On phones/tablets there are on-screen buttons.

## Files

- `server.js` game server (lobby, roles, movement, guard, alarm)
- `clues.js` clue generator (always gives 2 or 3 clues that point to exactly one cupboard)
- `public/room.js` the kitchen layout and guard route (add new rooms here later)
- `public/render.js` all the cartoon drawing
- `public/index.html` the page players see
- `test/sim.js` automated multiplayer test (`node test/sim.js`)

## Known limits

- One lobby per server. Everyone who opens the link joins the same game.
- Hidden information is hidden on screen, not cryptographically: a teammate who opens browser dev tools can peek. It's a coffee break, so it runs on trust.
- No sound yet (on purpose, so it doesn't fight with Meet audio).
