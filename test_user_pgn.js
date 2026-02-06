
const { Chess } = require('chess.js');

const pgn = `[Event "?"]
[Site "?"]
[Date "????.??.??"]
[Round "?"]
[White "?"]
[Black "?"]
[Result "*"]
 *`;

const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

console.log('Testing PGN load...');
const c = new Chess();
try {
    c.loadPgn(pgn);
    console.log('PGN loaded successfully');
    console.log('FEN:', c.fen());
} catch (e) {
    console.error('PGN load failed:', e.message);
}

console.log('Testing FEN load...');
const c2 = new Chess();
try {
    c2.load(fen);
    console.log('FEN loaded successfully');
} catch (e) {
    console.error('FEN load failed:', e.message);
}
