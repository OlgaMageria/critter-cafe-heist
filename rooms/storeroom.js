'use strict';
// Theme: The Storeroom. Containers are crates. See rooms/index.js for the map legend.
module.exports = {
  title: 'The Storeroom',
  noun: 'crate',
  look: {
    floorA: '#e9d9bf', floorB: '#dfcbab', wall: '#8c7357', trim: '#6d563d',
    windows: [], deco: { emoji: '🕸️', x: 14.5 }
  },
  legend: {
    H: { name: 'Shelf', kind: 'furniture', emoji: '🥫', fill: '#e6d3b0' },
    B: { name: 'Barrels', kind: 'furniture', emoji: '🛢️', fill: '#d9b98c' },
    W: { name: 'Wine rack', kind: 'furniture', emoji: '🍷', fill: '#ecd0dc' },
    S: { name: 'Coffee sacks', kind: 'furniture', emoji: '☕', fill: '#eadfc9' },
    F: { name: 'Freezer', kind: 'appliance', emoji: '🧊', fill: '#cfeaff' },
    T: { name: 'Workbench', kind: 'appliance', emoji: '🔧', fill: '#d8e0e8' },
    L: { name: 'Ladder', kind: 'furniture', emoji: '🪜', fill: '#f3e1c4' }
  },
  layouts: [
    {
      name: 'Aisles',
      rows: [
        '...EE.......12',
        'x...........34',
        'r......n....xg',
        'B...H...H....F',
        'B...H...H....F',
        'b.n.H...H....p',
        '...........x..',
        '...oTTTSSSy.n.'
      ],
      route: [[3, 2.5, 2], [10.5, 2.5, 2], [10.5, 7.5, 1.5], [7.5, 7.5, 2], [3, 7.5, 2], [3, 5, 1]]
    },
    {
      name: 'Cold store',
      rows: [
        'bWWr..gS..p...',
        '........n.....',
        '.............E',
        '.....FFF.....E',
        '.....FFF.....x',
        '..n........n..',
        '34.......x....',
        '12..oTT...yBBx'
      ],
      route: [[3, 3.2, 2], [11, 3.2, 2.5], [11, 6.8, 1.5], [5, 6.8, 2.5]]
    },
    {
      name: 'Maze',
      rows: [
        '.rB.....gS.Wb.',
        '..........1234',
        '..HHHHH..n....',
        '.............o',
        'p............F',
        'L..n...HHHHH..',
        '..x.........x.',
        '..yTT...EE..n.'
      ],
      route: [[2.5, 2.5, 2], [9, 2.5, 2], [9.5, 5.4, 1.5], [2.5, 5.4, 2.5]]
    },
    {
      name: 'Loading bay',
      rows: [
        '...rS..bB..gW.',
        '..........1234',
        'y.....n.....n.',
        'L...HHHH......',
        'x...HHHH.....p',
        '..........x..F',
        'E...n........F',
        'E.....oTTT..x.'
      ],
      route: [[3, 2.5, 2], [8.5, 2.5, 2], [11, 5.5, 1.5], [11, 7.4, 1.5], [3.5, 7.4, 2.5], [3.5, 5.2, 1]]
    },
    {
      name: 'Wine cellar',
      rows: [
        '.....ySS.EE...',
        'r..x........12',
        'W...n.......34',
        'W............o',
        'b....HHHH....B',
        '.....HHHH.n..B',
        '.n.........x..',
        '...gTTpFF...x.'
      ],
      route: [[3.5, 2.5, 2], [10, 2.5, 2.5], [12, 7.5, 1.5], [4.5, 7.5, 2.5], [3.5, 4, 1.5]]
    }
  ]
};
