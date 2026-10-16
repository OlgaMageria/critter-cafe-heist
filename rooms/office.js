'use strict';
// Theme: The Back Office. Containers are filing cabinets. See rooms/index.js for the map legend.
module.exports = {
  title: 'The Back Office',
  noun: 'cabinet',
  look: {
    floorA: '#eaf2ff', floorB: '#dce8fa', wall: '#9fb4cf', trim: '#7d93b1',
    windows: [[2, 2], [11, 2]], deco: { emoji: '🕐', x: 8 }
  },
  legend: {
    D: { name: 'Desk', kind: 'furniture', emoji: '🖥️', fill: '#d9e6ff' },
    C: { name: 'Copier', kind: 'appliance', emoji: '🖨️', fill: '#e6e6f2' },
    W: { name: 'Water cooler', kind: 'appliance', emoji: '💧', fill: '#d3f1ff' },
    V: { name: 'Vending machine', kind: 'appliance', emoji: '🥤', fill: '#ffd9d9' },
    M: { name: 'Meeting table', kind: 'furniture', emoji: '📋', fill: '#f1e4c8' },
    S: { name: 'Sofa', kind: 'furniture', emoji: '🛋️', fill: '#ffe0ef' },
    B: { name: 'Bookshelf', kind: 'furniture', emoji: '📚', fill: '#e8d9c0' },
    L: { name: 'Plant', kind: 'furniture', emoji: '🪴', fill: '#d6f5c9' }
  },
  layouts: [
    {
      name: 'Open office',
      rows: [
        '.CCr.BBb..VVg.',
        '..............',
        '..n.........n.',
        'E...DDD..DDD..',
        'E...DDD..DDD.p',
        'L...........SS',
        'o...........43',
        'x..n.MMMy.x.21'
      ],
      route: [[3.5, 3.5, 2], [9.5, 3.5, 2], [9, 5.5, 1], [9, 7.4, 1.5], [4, 7.4, 2.5], [4, 5, 1]]
    },
    {
      name: 'Cubicles',
      rows: [
        '.........EE.12',
        'r...........34',
        'B.n...........',
        'B...DD..DD....',
        'b...DD..DD..n.',
        'W.............',
        'g.....x..n...x',
        '.Vp..CCo..Sy..'
      ],
      route: [[3.5, 2.5, 2], [8, 2.5, 2.5], [8, 6.8, 1.5], [12.5, 7.2, 2], [3.5, 6.5, 2.5]]
    },
    {
      name: 'Boardroom',
      rows: [
        '.rBB.gVV...b..',
        'x............x',
        '.n..........nS',
        '....MMMMMM...S',
        'p...MMMMMM...o',
        'L......x.....E',
        '......34.n...E',
        '....yW12....x.'
      ],
      route: [[2.5, 3.2, 2], [12.2, 3.2, 2.5], [12.2, 6.5, 1.5], [3.5, 6.5, 2]]
    },
    {
      name: 'Lounge',
      rows: [
        '12rL..g..bV...',
        '34............',
        '.SSSS..n...n..',
        'p............C',
        '.......MM....C',
        '..n....MM....o',
        '...x.........x',
        '..Wy......EE..'
      ],
      route: [[7.5, 2.5, 2], [12.5, 2.5, 2], [12.5, 7.5, 2], [6.5, 7.5, 2], [6.8, 4.5, 1.5]]
    },
    {
      name: 'Corridor',
      rows: [
        'BBr.Cb.gVVp...',
        '.............x',
        '..n.......n...',
        '...DDD..DDD..S',
        '...DDD..DDD..o',
        'E.............',
        'E........n..43',
        'x....x.yMMM.21'
      ],
      route: [[2.5, 3.5, 2], [12.5, 3.5, 2], [8, 3.5, 0.5], [8, 6.8, 1.5], [3, 6.8, 2.5]]
    }
  ]
};
