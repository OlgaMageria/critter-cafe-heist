// Shared room data: used by both the server (physics) and the browser (drawing).
// All positions are in "tiles". The room is 16 x 10 tiles; the outer ring is wall.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ROOM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    id: 'kitchen',
    title: 'Room 1: The Kitchen',
    W: 16,
    H: 10,
    // Playable area is x 1..15, y 1..9 (the ring around it is wall)
    solids: [
      { id: 'fridge',  kind: 'appliance', name: 'Fridge',         emoji: '🧊', x: 1,  y: 1, w: 1, h: 2, fill: '#cfeaff' },
      { id: 'red',     kind: 'cupboard',  name: 'Red',            emoji: '',   x: 2,  y: 1, w: 1, h: 1, fill: '#ff8f8f' },
      { id: 'stove',   kind: 'appliance', name: 'Stove',          emoji: '🍳', x: 3,  y: 1, w: 2, h: 1, fill: '#ffd9b8' },
      { id: 'blue',    kind: 'cupboard',  name: 'Blue',           emoji: '',   x: 5,  y: 1, w: 1, h: 1, fill: '#8fc2ff' },
      { id: 'sink',    kind: 'appliance', name: 'Sink',           emoji: '🚰', x: 6,  y: 1, w: 2, h: 1, fill: '#d8f3ec' },
      { id: 'green',   kind: 'cupboard',  name: 'Green',          emoji: '',   x: 8,  y: 1, w: 1, h: 1, fill: '#9be3a8' },
      { id: 'purple',  kind: 'cupboard',  name: 'Purple',         emoji: '',   x: 11, y: 1, w: 1, h: 1, fill: '#c9a6ff' },
      { id: 'orange',  kind: 'cupboard',  name: 'Orange',         emoji: '',   x: 13, y: 1, w: 1, h: 1, fill: '#ffb561' },
      { id: 'pastry',  kind: 'furniture', name: 'Pastry counter', emoji: '🥖', x: 11, y: 2, w: 3, h: 1, fill: '#ffe9b8' },
      { id: 'island',  kind: 'furniture', name: 'Island',         emoji: '🍰', x: 5,  y: 4, w: 4, h: 2, fill: '#f6d6ff' },
      { id: 'plant',   kind: 'furniture', name: 'Plant',          emoji: '🪴', x: 2,  y: 6, w: 1, h: 1, fill: '#d6f5c9' },
      { id: 'table',   kind: 'furniture', name: 'Round table',    emoji: '🍽️', x: 12, y: 5, w: 2, h: 2, fill: '#ffd6e4' },
      { id: 'yellow',  kind: 'cupboard',  name: 'Yellow',         emoji: '',   x: 14, y: 5, w: 1, h: 1, fill: '#ffe27a' }
    ],
    // Non-solid hiding spots: stand inside one and the guard can't see you
    boxes: [
      { x: 1,  y: 8, w: 1, h: 1 },
      { x: 10, y: 4, w: 1, h: 1 },
      { x: 13, y: 8, w: 1, h: 1 }
    ],
    exit: { x: 1, y: 4, w: 1, h: 2 },
    start: { x: 14.5, y: 8.5 },
    // Guard patrol loop (waypoints with a pause in seconds)
    route: [
      { x: 3.5,  y: 3,   pause: 2.5 },
      { x: 9.5,  y: 3,   pause: 2 },
      { x: 12.5, y: 4,   pause: 3 },
      { x: 9.5,  y: 5.5, pause: 1.5 },
      { x: 9.5,  y: 7.5, pause: 0.5 },
      { x: 4,    y: 7.5, pause: 2.5 }
    ],
    guard: { speed: 2.2, range: 4.2, half: 0.66 },
    runner: { speed: 3.8, half: 0.28 },
    light: 2.8,
    interactRange: 1.35,
    timeLimit: 240,
    // What stands next to each cupboard (used for clues)
    neighbors: {
      red: ['Fridge', 'Stove'],
      blue: ['Stove', 'Sink'],
      green: ['Sink'],
      purple: ['Pastry counter'],
      orange: ['Pastry counter'],
      yellow: ['Round table']
    },
    // Which wall each cupboard hangs on (used for clues)
    walls: { red: 'top', blue: 'top', green: 'top', purple: 'top', orange: 'top', yellow: 'right' },
    // Opening a wrong cupboard: alarm penalty, and the guard goes on alert for a while
    wrongPenalty: 25,
    alertSeconds: 8,
    alertSpeed: 1.6,
    alertRangeBonus: 0.8
  };
});
