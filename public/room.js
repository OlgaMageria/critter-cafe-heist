// Shared constants for every room, plus an empty default room.
// The real rooms (3 themes x 5 layouts) live in ../rooms/ and are built on the server;
// the server sends the chosen one to every player at the start of a round.
// All positions are in "tiles". Every room is 16 x 10 tiles; the outer ring is wall,
// the playable floor is x 1..14, y 1..8.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ROOM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    id: 'empty',
    title: '',
    noun: 'cupboard',
    W: 16,
    H: 10,
    layoutName: '',
    theme: { floorA: '#fff3e0', floorB: '#ffe8cc', wall: '#c79a7a', trim: '#a87a5c', windows: [], deco: null },
    // filled in per round by the server
    solids: [],
    boxes: [],
    exit: { x: 1, y: 4, w: 1, h: 2, side: 'left' },
    starts: [{ x: 14.5, y: 8.5 }],
    start: { x: 14.5, y: 8.5 },
    keypad: { x: 1.5, y: 5 },
    notes: [],
    route: [],
    neighbors: {},
    walls: {},

    // ----- rules that are the same everywhere -----
    // the cat patrols its route; when it sees a Runner it runs straight at them (right over the furniture),
    // when it hears a noise it goes to look, then it searches a moment and walks back to its route
    guard: {
      speed: 2.2, range: 4.2, half: 0.66,
      chaseSpeed: 3.1,       // still slower than a Runner, so you can get away
      investigateSpeed: 2.9,
      returnSpeed: 2.6,
      searchTime: 3,         // seconds it looks around where it lost you / heard the noise
      pounceRange: 0.55,     // this close while chasing = pounce
      pounceStun: 2          // seconds the cat sits dazed after a pounce
    },
    runner: { speed: 3.8, half: 0.28 },
    light: 2.8,
    interactRange: 1.35,
    keypadRange: 1.6,
    noteRange: 0.9,
    badCodePenalty: 15,
    keypadCooldown: 3,
    timeLimit: 300,
    // every extra runner means more ground to cover, so the team gets a bit more time
    extraRunnerTime: 40,
    // alarm gain per second while seen: 30 for the first seen runner, +15 for each extra one
    seenRate: 30,
    extraSeenRate: 15,
    // Lookout "radar": the cat only shows up as a fuzzy blip that refreshes every few seconds
    radar: { every: 4, jitter: 0.8, fade: 3.6 },
    // Opening a wrong container: alarm penalty, and the guard goes on alert for a while
    wrongPenalty: 25,
    alertSeconds: 8,
    alertSpeed: 1.6,
    alertRangeBonus: 0.8,
    // the cat caught up with a Runner
    pouncePenalty: 30,
    // a Runner who loses their connection: the host can hand the critter to someone else;
    // if nobody takes over within this many seconds, the round is called off
    dropSeconds: 60,
    maxPlayers: 15
  };
});
