'use strict';
// Door-lock generator: a 3-digit code hidden behind symbols.
// Three sticky notes in the room each show a SYMBOL. The Clue Keeper holds the decoder card
// (symbol -> digit). Read the notes in order 1-2-3, decode, type the digits on the keypad.

const SYMBOLS = ['🍓', '🐟', '🌙', '⭐', '🍄', '🔔'];

const shuffle = a => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

// Returns { decoder: [{sym, digit} x6], noteSyms: [s1,s2,s3], code: '472' }
function makeDoor() {
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, SYMBOLS.length);
  const decoder = SYMBOLS.map((sym, i) => ({ sym, digit: digits[i] }));
  const noteSyms = shuffle(SYMBOLS).slice(0, 3);
  const code = noteSyms.map(s => String(decoder.find(d => d.sym === s).digit)).join('');
  return { decoder, noteSyms, code };
}

// Decode what the notes show into the code (for tests)
function decode(decoder, syms) {
  return syms.map(s => { const d = decoder.find(x => x.sym === s); return d ? String(d.digit) : '?'; }).join('');
}

module.exports = { makeDoor, decode, SYMBOLS };
