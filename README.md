# 🐭🥐 Critter Cafe Heist (v0.4: a cat that chases, team scores, replays)

A co-op coffee-break game for remote teams. 1 to 15 players, about 5 minutes per round.
One player is the **Runner**, a tiny critter (the animal they picked) sneaking through a cafe at night.
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

- Up to **15 players**. Number 16 sees "Lobby full" and can try again when someone leaves.
- Late? Open the link anyway. If a round is running you watch it (⏳ in the crew list) and get a role as soon as the host starts the next round.

If everyone is on the same office network you can also share the `Same network` address printed by `npm start`.

## How a round works

| Role | Sees | Does NOT know |
| --- | --- | --- |
| **Runner** | only a small flashlight circle around themselves | where things are, which cupboard is right, the door code, where the guard is |
| 📜 **Clue Keeper** | clues about which cupboard hides the 🥐, plus the **decoder card** for the door code | the map |
| 🗺️ **Mapper** | the whole kitchen, the Runners' live positions, the 📝 note spots and the 🔢 keypad | which cupboard is right |
| 🔭 **Lookout** | the guard cat's patrol route and/or a fuzzy **radar** blip of the cat | where the Runners are |

### Rooms and layouts

Every round picks a random room and a random layout (never the same layout twice in a row):

| Room | Containers | Layouts |
| --- | --- | --- |
| The Kitchen | cupboards | Classic, Open plan, Galley, Corner counter, Island kitchen |
| The Back Office | cabinets | Open office, Cubicles, Boardroom, Lounge, Corridor |
| The Storeroom | crates | Aisles, Cold store, Maze, Loading bay, Wine cellar |

Layouts move the colored containers, furniture, hiding boxes, sticky notes, start spots, the guard's route and the **door** (it can be on any wall).
Clues can also say "NOT on the north wall" etc. A start-up check validates every layout (reachability, fair clues, guard route clear of furniture and away from the start spots).

1. The croissant hides in one of **6 colored containers** (cupboards, cabinets or crates). The Clue Keepers hold 2 or 3 short clues (like "it is right next to the sink" or "it is NOT the red cupboard"). The Mapper knows which cupboard is next to what, so clues and map have to be combined. Guide the Runner there and press **Space / E**.
   Don't brute-force it: a wrong cupboard is noisy (**+25 alarm**) and puts the guard cat on **alert for 8 seconds** (faster, fewer pauses, longer view).
2. **The door has a keypad lock (3 digits).** Three sticky notes 📝 lie around the kitchen. The Runner reads one by standing on it and pressing Space / E. Each note shows a **symbol** (🍓 🐟 🌙 ⭐ 🍄 🔔), and everybody sees it once it is read. Only the Clue Keeper's decoder card knows which digit each symbol stands for. The code is the digits in note order 1, 2, 3. The Runner stands near the door, presses Space / E to open the keypad and types it in. A wrong code is loud: **+15 alarm** and the keypad is blocked for 3 seconds.
3. With the croissant AND the open door, every Runner has to step into the **EXIT**.
4. The cat sees a Runner if they stand in its (invisible to the Lookout) view cone with a clear line of sight. Hide inside a 📦 box and it can't.
5. The alarm fills while a Runner is seen (30% per second, +15% for every extra Runner seen at the same time) and cools down slowly (2% per second) when nobody is seen. Alarm at 100%, or the timer running out, and you lose.

### The guard cat reacts

- **Spotted 🙀**: the cat runs straight at the Runner it sees, right over the furniture. It is a bit slower than a Runner, so run, or jump in a 📦 box.
- **Pounce 💥**: if it catches up, that is **+30 alarm**. The cat is dazed for 2 seconds, so get away.
- **Noise 👂**: a wrong container or a wrong door code makes the cat walk over to where the noise was.
- **Searching ❓**: where it lost you (or heard the noise) it looks around for 3 seconds, then walks back to the nearest stop of its route and carries on.

The HUD tells everyone what the cat is up to, and the Lookout's radar says "CHASING", "SEARCHING" etc., because a cat that left its route makes the route useless for a while.

### Playing tips on screen

- The Runner sees an **"E: open the red cupboard" / "E: read note 2" / "E: use the keypad"** bubble, so they always know what Space / E will do before they press it. On phones the action button says OPEN, READ or CODE.
- When the alarm passes about 60% the screen edge glows red, at 80% it throbs, and the alarm bar pulses. The timer turns red in the last 30 seconds and blinks in the last 10.
- 👏 😱 😂 🙀 ❤️ 🔥 reaction buttons under the game: everybody sees them float up with your name.
- **Sound** is off by default (so it doesn't fight with Meet). The 🔇 button at the top right turns on quiet synthesized effects: notes, cupboards, keypad, unlock, the cat spotting you, pounces, a heartbeat when the alarm is high, a ticking clock at the end, win and lose tunes. Your browser remembers the choice.

### Scores across rounds

Every round scores points for what the team got done, even a lost one:

| | points |
| --- | --- |
| each 📝 note read | +5 |
| 🔓 door unlocked | +20 |
| 🥐 croissant found | +30 |
| 🚪 everybody escaped | +100 |
| ⏱️ time bonus (won rounds) | +1 per 2 seconds left |
| 🤫 stealth bonus (won rounds) | +1 per 2% the alarm never reached |
| 😿 each wrong container | -10 |
| 🔢 each wrong code | -5 |

A round never scores below 0. A win gets ⭐ plus ⭐ for 90+ seconds left plus ⭐ for staying under 50% alarm without a wrong container.
The team scoreboard (total, wins, stars, streak, fastest escape, last rounds) is shown in the waiting room, in the HUD and after every round.
It lives as long as the server runs; the host can reset it in the waiting room.

### After every round: replay and reveal

The end screen shows a replay of the whole round on the full map: every Runner's path, the cat's last steps, the moments it spotted or pounced, the notes, the cupboards being opened. Play, pause, scrub, and change speed (1× to 8×).
It also reveals what was secret: which container had the croissant, the clues, and the door code.

### When a Runner's connection drops

The round keeps going. Everyone sees a 🔌 next to that critter, and the host gets **"Make X the Runner"** buttons.
The chosen player takes over the critter right where it stands (croissant included) and the two swap jobs: if the missing player comes back, they get the job of the player who took over.
The cat ignores a disconnected Runner. If nobody takes over and they don't come back within 60 seconds, the round is called off.

### More Runners

Roles go round in a circle: Runner, Clue Keeper, Mapper, Lookout, Runner, Clue Keeper, ...
So with 5 players the 5th is a **second Runner**, with 9 players a third, with 13 a fourth.
Every Runner has their own flashlight and sees only that; the specialists see all the flashlights at once, with each Runner's name and a colored ring.
The croissant is carried by whoever opens the right cupboard, the code and the alarm are shared, and **everybody has to get out**. A Runner who is out is safe and can help on Meet.
Every extra Runner adds 40 seconds to the 5:00 timer.

### The Lookout's radar

The Lookout no longer sees the cat's red view cone. Their live view is a green blip that shows roughly where the cat was at the last ping (every 4 seconds, with a bit of random fuzz) and fades until the next one, with a dotted circle where it was before. The numbered patrol route tells them where the cat is going and how long it waits at each stop. With 2+ Lookouts one gets the route and the other the radar, so they have to talk.

Roles rotate every round ("Next round" button). With 3 players: Runner, Clue Keeper, Mapper+Lookout.
With 2 players: Runner and one player who sees every specialist screen. With 1 player (solo test) you are the Runner and also see every specialist screen.
With more than 3 specialists, clues, decoder cards and map labels are split between players, so they have to talk even more.

## Controls (Runner)

WASD or arrow keys to move. Space or E opens a cupboard, reads a sticky note, or opens the door keypad (depending on what you stand next to). In the keypad: type digits, Backspace, Enter to confirm, Esc to close. While the keypad is open you stand still, so be quick. On phones/tablets there are on-screen buttons.

## Files

- `server.js` game server (lobby, roles, movement, guard cat, alarm, events, replay recording, hand-over)
- `scoring.js` round points, stars and the team scoreboard
- `clues.js` clue generator (always gives 2 or 3 clues that point to exactly one cupboard)
- `door.js` door-code generator (symbols, decoder card, 3-digit code)
- `public/room.js` shared timings and defaults
- `rooms/index.js` room builder, validator and random picker; `rooms/kitchen.js`, `office.js`, `storeroom.js` hold the ASCII layouts (legend at the top of index.js). Add a new room by adding a file and listing it in index.js
- `public/rules.js` what Space / E does, shared by the server and the browser
- `public/render.js` all the cartoon drawing, including the replay
- `public/sound.js` the synthesized sound effects
- `public/index.html` the page players see
- `test/sim.js` automated multiplayer test, incl. a full door-code run with 2 runners in every layout
- `test/ui.js` browser test with 3 real (headless) browser tabs
- `.github/workflows/test.yml` runs all of it on GitHub for every push

## Testing

```bash
npm test             # rooms, clues, scores + multiplayer games over WebSocket in every layout (~2 min)
npm run test:quick   # the same with one layout per room
npm run test:unit    # only the tests that need no server (seconds)
npm run test:ui      # real browsers: needs `npx playwright install chromium` once
npm run test:all     # npm test + the browser test
```

`SHOTS=screenshots npm run test:ui` also saves screenshots of every step. GitHub runs `npm test` on Node 18, 20 and 22 plus the browser test on every push and pull request (Actions tab).

Test mode: `CCH_DEBUG=1` makes the guard blind, allows teleporting and sends the secrets to the browsers; add `CCH_SEE=1` to give the guard its eyes back; `CCH_ROOM=kitchen:3` forces a room and layout.
Playing only? `npm install --omit=dev` skips the test tools.

## Known limits of v0.4

- One lobby per server. Everyone who opens the link joins the same game.
- Hidden information is hidden on screen, not cryptographically: a teammate who opens browser dev tools can peek. It's a coffee break, so it runs on trust.
- The team scoreboard is kept in memory: restarting the server resets it.
