
const { Chess } = require('chess.js');
const chess = new Chess();
console.log('Initial turn:', chess.turn());
chess.move('e4');
console.log('After e4 turn:', chess.turn());
