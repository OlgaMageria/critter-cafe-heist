'use strict';
// Round scores and the team scoreboard that carries over between rounds (kept in memory while the server runs).
//
// Every round earns points for what the team got done, even when it is lost:
//   each sticky note read +5, door unlocked +20, croissant found +30,
//   everybody out +100, plus a time bonus (1 point per 2 seconds left) and a stealth bonus (calm alarm).
//   Every wrong container -10, every wrong door code -5. A round never scores below 0.
// A won round also gets 1 to 3 stars.

const POINTS = { note: 5, unlock: 20, croissant: 30, escape: 100, wrong: -10, badCode: -5 };

// st: { win, notes, unlocked, cro, wrong, badCodes, timeLeft, maxAlarm }
function scoreRound(st) {
  const parts = [];
  const add = (label, pts) => { if (pts) parts.push({ label, pts }); };
  if (st.notes) add(`📝 ${st.notes} note${st.notes > 1 ? 's' : ''} read`, POINTS.note * st.notes);
  if (st.unlocked) add('🔓 Door unlocked', POINTS.unlock);
  if (st.cro) add('🥐 Croissant found', POINTS.croissant);
  if (st.win) {
    add('🚪 Everybody escaped', POINTS.escape);
    add('⏱️ Time bonus', Math.floor(Math.max(0, st.timeLeft) / 2));
    add('🤫 Stealth bonus', Math.floor(Math.max(0, 100 - st.maxAlarm) / 2));
  }
  if (st.wrong) add(`😿 ${st.wrong} wrong container${st.wrong > 1 ? 's' : ''}`, POINTS.wrong * st.wrong);
  if (st.badCodes) add(`🔢 ${st.badCodes} wrong code${st.badCodes > 1 ? 's' : ''}`, POINTS.badCode * st.badCodes);
  const pts = Math.max(0, parts.reduce((a, p) => a + p.pts, 0));
  const stars = st.win ? 1 + (st.timeLeft >= 90 ? 1 : 0) + (st.maxAlarm < 50 && !st.wrong ? 1 : 0) : 0;
  return { pts, stars, parts };
}

function makeBoard() {
  return { total: 0, rounds: 0, wins: 0, streak: 0, bestStreak: 0, fastest: null, stars: 0, history: [] };
}

// entry: { round, room, layout, win, reason, time (seconds used) } + the result of scoreRound
function addRound(board, entry) {
  board.total += entry.pts;
  board.rounds++;
  board.stars += entry.stars;
  if (entry.win) {
    board.wins++;
    board.streak++;
    board.bestStreak = Math.max(board.bestStreak, board.streak);
    if (board.fastest == null || entry.time < board.fastest) board.fastest = entry.time;
  } else board.streak = 0;
  board.history.unshift({
    round: entry.round, room: entry.room, layout: entry.layout,
    win: entry.win, reason: entry.reason, pts: entry.pts, stars: entry.stars, time: entry.time
  });
  board.history.length = Math.min(board.history.length, 10);
  return board;
}

module.exports = { POINTS, scoreRound, makeBoard, addRound };
