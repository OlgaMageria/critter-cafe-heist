'use strict';
// Clue generator: picks 2-3 TRUE statements that together point to exactly one container.
// No single statement is enough on its own, and the furniture-based ones need the Mapper
// to translate "next to the sink" into "the green cupboard".
// Works for any room: the furniture and wall statements come from the room itself.

function buildStatements(R, cupboards) {
  const list = [];
  const noun = R.noun || 'cupboard';
  // every piece of furniture that stands next to at least one container
  const feats = [...new Set(cupboards.flatMap(c => R.neighbors[c.id] || []))].sort();
  for (const n of feats) {
    list.push({
      text: `It is right next to the ${n.toLowerCase()}.`,
      test: c => (R.neighbors[c.id] || []).includes(n)
    });
    list.push({
      text: `It is NOT next to the ${n.toLowerCase()}.`,
      test: c => !(R.neighbors[c.id] || []).includes(n)
    });
  }
  for (const w of cupboards) {
    list.push({ text: `It is NOT the ${w.name.toLowerCase()} ${noun}.`, test: c => c.id !== w.id });
  }
  // walls: only the ones that actually have containers on them (a corner container touches two)
  const wallNames = [...new Set(cupboards.flatMap(c => R.walls[c.id] || []))];
  for (const wall of wallNames) {
    list.push({ text: `It is on the ${wall} wall.`, test: c => (R.walls[c.id] || []).includes(wall) });
    list.push({ text: `It is NOT on the ${wall} wall.`, test: c => !(R.walls[c.id] || []).includes(wall) });
  }
  return list;
}

const shuffle = a => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

function candidates(set, cupboards) {
  return cupboards.filter(c => set.every(s => s.test(c)));
}

// Returns an array of 2-3 clue strings for the given truth container id,
// or null if this room has no fair clue set for it.
function makeClues(R, truth) {
  const cupboards = R.solids.filter(s => s.kind === 'cupboard');
  const T = cupboards.find(c => c.id === truth);
  if (!T) return null;
  const trueOnes = buildStatements(R, cupboards).filter(s => s.test(T));
  const solves = set => { const c = candidates(set, cupboards); return c.length === 1 && c[0].id === truth; };

  const pairs = [], triples = [];
  for (let i = 0; i < trueOnes.length; i++) {
    for (let j = i + 1; j < trueOnes.length; j++) {
      const p = [trueOnes[i], trueOnes[j]];
      if (solves(p) && !solves([p[0]]) && !solves([p[1]])) pairs.push(p);
      for (let k = j + 1; k < trueOnes.length; k++) {
        const t = [trueOnes[i], trueOnes[j], trueOnes[k]];
        if (!solves(t)) continue;
        // minimal: no two of the three already solve it
        if (solves([t[0], t[1]]) || solves([t[0], t[2]]) || solves([t[1], t[2]])) continue;
        triples.push(t);
      }
    }
  }
  if (!pairs.length && !triples.length) return null;
  // prefer three short clues most of the time (more to think about), pairs sometimes
  const pool = (triples.length && (Math.random() < 0.6 || !pairs.length)) ? triples : (pairs.length ? pairs : triples);
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return shuffle(chosen).map(s => s.text);
}

// For tests: do these clue texts single out exactly one container?
function solveClues(R, texts) {
  const cupboards = R.solids.filter(s => s.kind === 'cupboard');
  const all = buildStatements(R, cupboards);
  const set = texts.map(t => all.find(s => s.text === t));
  if (set.some(s => !s)) return null;
  return candidates(set, cupboards).map(c => c.id);
}

module.exports = { makeClues, solveClues };
