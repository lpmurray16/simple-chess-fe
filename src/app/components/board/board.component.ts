import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService, GameState } from '../../services/game.service';
import { AuthService } from '../../services/auth.service';
import { HeaderComponent } from '../header/header.component';
import { Subscription } from 'rxjs';
import { Chess, Piece, Square } from 'chess.js';

@Component({
    selector: 'app-board',
    standalone: true,
    imports: [CommonModule, HeaderComponent],
    templateUrl: './board.component.html',
    styleUrls: ['./board.component.scss'],
})
export class BoardComponent implements OnInit, OnDestroy {
    gameState: GameState | null = null;
    board: ({ square: Square; type: string; color: string } | null)[][] = [];
    selectedSquare: Square | null = null;
    validMoves: string[] = [];
    promotionMove: { from: string; to: string } | null = null;

    errorMessage: string | null = null;

    private sub: Subscription | null = null;
    private errorSub: Subscription | null = null;

    // Unicode pieces
    pieceIcons: { [key: string]: string } = {
        'w-p': '♙',
        'w-n': '♘',
        'w-b': '♗',
        'w-r': '♖',
        'w-q': '♕',
        'w-k': '♔',
        'b-p': '♟',
        'b-n': '♞',
        'b-b': '♝',
        'b-r': '♜',
        'b-q': '♛',
        'b-k': '♚',
    };

    constructor(
        public gameService: GameService,
        public auth: AuthService,
    ) {}

    ngOnInit() {
        this.sub = this.gameService.gameState$.subscribe((state) => {
            this.gameState = state;
            if (state) {
                this.updateBoard();
            }
        });

        this.errorSub = this.gameService.error$.subscribe((err) => {
            this.errorMessage = err;
        });
    }

    ngOnDestroy() {
        this.sub?.unsubscribe();
        this.errorSub?.unsubscribe();
    }

    updateBoard() {
        // Chess.js board() returns 8x8 array of { type, color } or null
        // We need to access the chess instance from service or re-create local one?
        // Service exposes fen. We can use a local chess instance to parse fen for board.
        const chess = new Chess(this.gameService.fen);
        this.board = chess.board(); // 8x8, Rank 8 at index 0
    }

    get isSpectator(): boolean {
        return this.gameService.isSpectator();
    }

    get orientation(): 'white' | 'black' {
        return this.gameService.getPlayerColor() === 'b' ? 'black' : 'white';
    }

    get displayedBoard() {
        if (this.orientation === 'white') {
            return this.board;
        } else {
            // Reverse ranks
            const reversedRanks = [...this.board].reverse();
            // Reverse files in each rank
            return reversedRanks.map((rank) => [...rank].reverse());
        }
    }

    get whitePlayerName(): string {
        const player = this.gameState?.expand?.white_player;
        return player?.name || player?.username || player?.email || 'No Player Found Yet';
    }

    get blackPlayerName(): string {
        const player = this.gameState?.expand?.black_player;
        return player?.name || player?.username || player?.email || 'No Player Found Yet';
    }

    // Helper to map visual index to actual square coordinate
    getSquareFromVisual(rowIndex: number, colIndex: number): Square {
        // If white: row 0 is Rank 8, col 0 is File a
        // If black: row 0 is Rank 1, col 0 is File h

        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

        if (this.orientation === 'white') {
            return (files[colIndex] + ranks[rowIndex]) as Square;
        } else {
            return (files[7 - colIndex] + ranks[7 - rowIndex]) as Square;
        }
    }

    async onSquareClick(visualRowIndex: number, visualColIndex: number) {
        if (!this.gameState) return;

        // Check if game is over
        // Check against terminal states
        if (['Checkmate', 'Stalemate'].includes(this.gameState.status)) return;

        // Check if user is a player
        const playerColor = this.gameService.getPlayerColor();
        if (!playerColor) return; // Spectator cannot move

        // Check if it's player's turn
        if (!this.gameService.isMyTurn()) return;

        const square = this.getSquareFromVisual(visualRowIndex, visualColIndex);

        // Get piece at this square
        // We can find it in displayedBoard[visualRowIndex][visualColIndex]
        const cell = this.displayedBoard[visualRowIndex][visualColIndex];

        // If selecting own piece
        if (cell && cell.color === playerColor) {
            this.selectedSquare = square;
            this.validMoves = this.gameService.getValidMoves(square).map((m) => m.to);
            return;
        }

        // If moving to a target
        if (this.selectedSquare) {
            if (this.validMoves.includes(square)) {
                // Check for promotion
                const moves = this.gameService.getValidMoves(this.selectedSquare);
                const move = moves.find((m) => m.to === square);

                if (move && move.promotion) {
                    this.promotionMove = { from: this.selectedSquare, to: square };
                } else {
                    await this.gameService.makeMove(this.selectedSquare, square);
                    this.selectedSquare = null;
                    this.validMoves = [];
                }
            } else {
                // Invalid move, deselect (unless we clicked another own piece, handled above)
                this.selectedSquare = null;
                this.validMoves = [];
            }
        }
    }

    async onPromotionSelect(piece: string) {
        if (this.promotionMove) {
            await this.gameService.makeMove(this.promotionMove.from, this.promotionMove.to, piece);
            this.promotionMove = null;
            this.selectedSquare = null;
            this.validMoves = [];
        }
    }

    cancelPromotion() {
        this.promotionMove = null;
        this.selectedSquare = null;
        this.validMoves = [];
    }

    getPieceIcon(piece: { type: string; color: string } | null): string {
        if (!piece) return '';
        return this.pieceIcons[`${piece.color}-${piece.type}`] || '';
    }

    isSquareSelected(visualRowIndex: number, visualColIndex: number): boolean {
        return this.getSquareFromVisual(visualRowIndex, visualColIndex) === this.selectedSquare;
    }

    isSquareValidMove(visualRowIndex: number, visualColIndex: number): boolean {
        return this.validMoves.includes(this.getSquareFromVisual(visualRowIndex, visualColIndex));
    }

    async join(color: 'white' | 'black') {
        if (!this.auth.currentUserId) {
            this.auth.requestLogin();
            return;
        }
        await this.gameService.joinGame(color);
    }

    refresh() {
        this.gameService.refreshGame();
    }
}
