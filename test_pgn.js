
const { Chess } = require('chess.js');

const chess = new Chess();
chess.move('e4');
chess.move('e5');
const fen = chess.fen();
const pgn = chess.pgn();

console.log('--- Original ---');
console.log('FEN:', fen);
console.log('PGN:', pgn);
console.log('History:', chess.history());

const chessFen = new Chess();
chessFen.load(fen);
console.log('--- Loaded from FEN ---');
console.log('FEN:', chessFen.fen());
console.log('PGN:', chessFen.pgn()); // Expecting headers only or different PGN
console.log('History:', chessFen.history()); // Expecting empty

const chessPgn = new Chess();
chessPgn.loadPgn(pgn);
console.log('--- Loaded from PGN ---');
console.log('FEN:', chessPgn.fen()); // Should match
console.log('PGN:', chessPgn.pgn()); // Should match
console.log('History:', chessPgn.history()); // Should match
