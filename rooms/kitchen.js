'use strict';
// Theme: The Kitchen. Containers are cupboards. See rooms/index.js for the map legend.
module.exports = {
  title: 'The Kitchen',
  noun: 'cupboard',
  look: {
    floorA: '#fff3e0', floorB: '#ffe8cc', wall: '#c79a7a', trim: '#a87a5c',
    windows: [[3, 2], [9, 2]], deco: { emoji: '☕', x: 12.5 }
  },
  legend: {
    F: { name: 'Fridge', kind: 'appliance', emoji: '🧊', fill: '#cfeaff' },
    S: { name: 'Stove', kind: 'appliance', emoji: '🍳', fill: '#ffd9b8' },
    K: { name: 'Sink', kind: 'appliance', emoji: '🚰', fill: '#d8f3ec' },
    A: { name: 'Pastry counter', kind: 'furniture', emoji: '🥖', fill: '#ffe9b8' },
    I: { name: 'Island', kind: 'furniture', emoji: '🍰', fill: '#f6d6ff' },
    L: { name: 'Plant', kind: 'furniture', emoji: '🪴', fill: '#d6f5c9' },
    T: { name: 'Round table', kind: 'furniture', emoji: '🍽️', fill: '#ffd6e4' }
  },
  layouts: [
    {
      name: 'Classic',
      rows: [
        'FrSSbKKg..p.o.',
        'F.........AAA.',
        '........n....n',
        'E...IIII.x....',
        'E...IIII...TTy',
        '.L.........TT4',
        '.............2',
        'x.n........3x1'
      ],
      route: [[3.5, 3, 2.5], [9.5, 3, 2], [12.5, 4, 3], [9.5, 5.5, 1.5], [9.5, 7.5, 0.5], [4, 7.5, 2.5]]
    },
    {
      name: 'Open plan',
      rows: [
        '....KKgbSS..F.',
        '..n.........F.',
        '.........n....',
        'p....III....xE',
        'L....III.....E',
        'o.........TT..',
        '.12.n.....TT..',
        'x34...rAAAy.x.'
      ],
      route: [[3.5, 3.2, 2], [12, 3.2, 2.5], [9.5, 6.5, 1.5], [6, 7.3, 2.5], [4.5, 4.8, 1]]
    },
    {
      name: 'Galley',
      rows: [
        '12....EE......',
        '34.........x.g',
        '.L.n.........S',
        '....III..TT..S',
        'n...III..TT..b',
        'x............K',
        '.......x...n.K',
        '.pFFr...yAAA.o'
      ],
      route: [[5, 2.5, 2.5], [10, 2.5, 2], [9, 5, 1.5], [9, 6.8, 0.5], [3, 6.8, 2.5]]
    },
    {
      name: 'Corner counter',
      rows: [
        '.rF..gSSb..p..',
        '..F.......AAA.',
        '.n.......n....',
        '....IIII......',
        'o...IIII...TTy',
        'L..........TT.',
        '..n.........43',
        'x...x.EE...x21'
      ],
      route: [[3, 3.5, 2.5], [10, 3.5, 2], [10.5, 6.5, 1.5], [5, 7.2, 2.5], [2.5, 5.5, 1]]
    },
    {
      name: 'Island kitchen',
      rows: [
        '....rFF..gSS..',
        '..n..........x',
        'y.....x....TTp',
        'L..........TT.',
        'x....III......',
        'E....III.n....',
        'E...........43',
        '.KKb.n..oAAA21'
      ],
      route: [[3, 3.5, 2], [9.5, 3.5, 2.5], [10, 5.5, 2], [10.5, 7.5, 1], [3.5, 7.5, 2.5]]
    }
  ]
};
