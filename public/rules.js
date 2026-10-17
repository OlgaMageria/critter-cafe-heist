// Rules shared by the server and the browser, so "what Space / E does" is decided the same way on both.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RULES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Everything within reach of (x, y): sticky notes, the door keypad, containers. The closest one wins.
  // Returns { k: 'note', i, d } | { k: 'pad', d } | { k: 'cup', s, d } | null
  function interactTarget(R, x, y) {
    const cands = [];
    R.notes.forEach((n, i) => { const d = Math.hypot(x - n.x, y - n.y); if (d <= R.noteRange) cands.push({ k: 'note', i, d }); });
    const kd = Math.hypot(x - R.keypad.x, y - R.keypad.y);
    if (kd <= R.keypadRange) cands.push({ k: 'pad', d: kd });
    for (const s of R.solids) {
      if (s.kind !== 'cupboard') continue;
      const d = Math.hypot(x - (s.x + s.w / 2), y - (s.y + s.h / 2));
      if (d <= R.interactRange) cands.push({ k: 'cup', s, d });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.d - b.d);
    return cands[0];
  }

  // Short text for the "E: ..." prompt. st: the live state ({ nt, op, ul })
  function promptText(R, t, st) {
    if (!t) return null;
    st = st || {};
    if (t.k === 'note') return (st.nt && st.nt[t.i]) ? { text: 'Note ' + (t.i + 1) + ' (read)', done: true, btn: 'READ' } : { text: 'Read note ' + (t.i + 1), btn: 'READ' };
    if (t.k === 'pad') return st.ul ? { text: 'Door is unlocked', done: true, btn: 'CODE' } : { text: 'Use the keypad', btn: 'CODE' };
    const noun = R.noun || 'cupboard';
    if (st.op && st.op[t.s.id]) return { text: t.s.name + ' ' + noun + ' (checked)', done: true, btn: 'OPEN' };
    return { text: 'Open the ' + t.s.name.toLowerCase() + ' ' + noun, btn: 'OPEN' };
  }

  return { interactTarget, promptText };
});
