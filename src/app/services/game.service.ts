import { Injectable, NgZone } from '@angular/core';
import { AuthService } from './auth.service';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { Chess, Square, Move } from 'chess.js';
import { NotificationService } from './notification.service';

export type GameStatus =
    | 'New'
    | 'White Move'
    | 'Black Move'
    | 'In Check'
    | 'Checkmate'
    | 'Stalemate'
    | 'Draw';

export interface GameState {
    id: string;
    fen: string;
    white_player: string | null; // User ID
    black_player: string | null; // User ID
    expand?: {
        white_player?: { username: string; name: string; email: string };
        black_player?: { username: string; name: string; email: string };
    };
    pgn: string; // Store PGN for history
    status: GameStatus;
    lastMove?: { from: string; to: string } | null;
}

@Injectable({
    providedIn: 'root',
})
export class GameService {
    private gameStateSubject = new BehaviorSubject<GameState | null>(null);
    public gameState$ = this.gameStateSubject.asObservable();

    private isLoadingSubject = new BehaviorSubject<boolean>(true);
    public isLoading$ = this.isLoadingSubject.asObservable();

    private errorSubject = new BehaviorSubject<string | null>(null);
    public error$ = this.errorSubject.asObservable();

    public capture$ = new Subject<void>();

    private chess = new Chess();
    private isSubscribed = false;

    constructor(
        private auth: AuthService,
        private ngZone: NgZone,
        private notificationService: NotificationService,
    ) {
        // Re-initialize game if user logs in
        this.auth.currentUser$.subscribe((user) => {
            if (user) {
                this.initGameSubscription();
            } else {
                // User is logged out. We are not loading a game.
                this.isLoadingSubject.next(false);

                // Clear state on logout
                this.gameStateSubject.next(null);
                if (this.isSubscribed) {
                    this.isSubscribed = false;
                    this.auth.client
                        .collection('game_state')
                        .unsubscribe('*')
                        .catch(() => {});
                }
            }
        });
    }

    private getOpponentId(): string | null {
        const state = this.gameStateSubject.value;
        if (!state) {
            return null;
        }

        const currentUserId = this.auth.currentUserId;
        if (state.white_player === currentUserId) {
            return state.black_player;
        } else if (state.black_player === currentUserId) {
            return state.white_player;
        }

        return null;
    }

    private async initGameSubscription() {
        // Wait for user to be logged in before initializing game
        if (!this.auth.isValid) {
            console.log('User not logged in, skipping game initialization');
            return;
        }

        if (this.isSubscribed) return;
        this.isSubscribed = true;
        console.log('Initializing game subscription...');
        // Subscribe to the games collection
        // We assume there is only one game for simplicity as requested.
        // If no game exists, we might need to create one, or wait for one.

        // First, try to fetch the existing game (blocking load)
        await this.fetchOrCreateGame(false);

        // Subscribe to changes
        this.auth.client.collection('game_state').subscribe('*', (e) => {
            if (e.action === 'update' || e.action === 'create') {
                // This is a background update.
                this.fetchOrCreateGame(true);
            }
        });
    }

    private async fetchOrCreateGame(isBackground: boolean = false) {
        console.log(`Fetching game state (background: ${isBackground})...`);

        if (!isBackground) {
            this.isLoadingSubject.next(true);
            this.errorSubject.next(null);
        }

        try {
            const list = await this.auth.client.collection('game_state').getList(1, 1, {
                sort: '-created',
                expand: 'white_player,black_player',
            });

            console.log('Game state fetched:', list);

            if (list.items.length > 0) {
                const item = list.items[0];
                console.log('Expanded data:', item.expand);
                this.updateLocalState(item as any);
            } else {
                // Create a new game if none exists
                console.log('No game found, creating new one...');
                await this.resetGame();
            }
        } catch (err: any) {
            console.error('Error fetching game:', err);
            if (!isBackground) {
                this.errorSubject.next(err.message || 'Failed to load game realm');
            }
        } finally {
            if (!isBackground) {
                this.ngZone.run(() => {
                    console.log('Setting isLoading to false');
                    this.isLoadingSubject.next(false);
                });
            }
        }
    }

    async refreshGame() {
        await this.fetchOrCreateGame(true);
    }

    private updateLocalState(record: any, shouldCheckCapture: boolean = false) {
        console.log('Updating local state with record:', record);
        const state: GameState = {
            id: record.id,
            fen: record.fen,
            white_player: record.white_player,
            black_player: record.black_player,
            expand: record.expand,
            pgn: record.pgn,
            status: record.status,
        };

        // Store old PGN for capture detection
        const oldPgn = this.chess.pgn();

        // Sync internal chess logic FIRST
        // We prioritize PGN to preserve move history and repetition state
        try {
            if (state.pgn) {
                console.log('Loading PGN:', state.pgn);
                this.chess.loadPgn(state.pgn);

                // Extract last move from history after loading PGN
                const history = this.chess.history({ verbose: true });
                if (history.length > 0) {
                    const lastMove = history[history.length - 1];
                    state.lastMove = { from: lastMove.from, to: lastMove.to };
                } else {
                    state.lastMove = null;
                }
            } else {
                throw new Error('No PGN available');
            }
        } catch (pgnError) {
            console.warn('Failed to load PGN, falling back to FEN', pgnError);
            try {
                this.chess.load(state.fen);
            } catch (fenError) {
                console.error('Invalid FEN loaded', fenError);
            }
        }

        // Check for capture if this is an update (not initial load)
        if (shouldCheckCapture) {
            const newPgn = this.chess.pgn();
            if (newPgn !== oldPgn) {
                const history = this.chess.history({ verbose: true });
                const lastMove = history[history.length - 1];
                if (lastMove && lastMove.captured) {
                    console.log('Capture detected!');
                    this.capture$.next();
                }
            }
        }

        // Emit state inside Angular Zone to ensure UI updates
        this.ngZone.run(() => {
            console.log('Emitting new state to subscribers');
            this.gameStateSubject.next(state);
        });
    }

    async makeMove(from: string, to: string, promotion: string = 'q') {
        const currentState = this.gameStateSubject.value;
        if (!currentState) return;

        // Validate turn
        const turnColor = this.chess.turn(); // 'w' or 'b'
        const userId = this.auth.currentUserId;

        if (turnColor === 'w' && currentState.white_player !== userId) {
            throw new Error('Not your turn (You are not White)');
        }
        if (turnColor === 'b' && currentState.black_player !== userId) {
            throw new Error('Not your turn (You are not Black)');
        }

        // Try move locally first to validate
        try {
            const move = this.chess.move({ from, to, promotion });
            if (!move) throw new Error('Invalid move');

            if (move.captured) {
                this.capture$.next();
            }
        } catch (e) {
            throw new Error('Invalid move');
        }

        // Determine status
        let status: GameStatus = 'White Move';
        if (this.chess.turn() === 'b') {
            status = 'Black Move';
        } else {
            status = 'White Move';
        }

        if (this.chess.isCheckmate()) {
            status = 'Checkmate';
        } else if (this.chess.isStalemate()) {
            status = 'Stalemate';
        } else if (this.chess.isDraw()) {
            status = 'Draw';
        } else if (this.chess.inCheck()) {
            status = 'In Check';
        }

        // Update backend
        await this.auth.client.collection('game_state').update(currentState.id, {
            fen: this.chess.fen(),
            pgn: this.chess.pgn(),
            status: status,
        });

        // Notify the opponent that it is their turn
        const opponentId = this.getOpponentId();
        if (opponentId) {
            this.notificationService.sendTurnNotification(opponentId);
        }

        // Log game history if the game ended
        if (this.chess.isGameOver()) {
            await this.logGameHistory(status);
        }
    }

    private async logGameHistory(status: GameStatus) {
        const currentState = this.gameStateSubject.value;
        if (!currentState) return;

        let winner: string | null = null;
        let loser: string | null = null;
        let end_game_status: 'Checkmate' | 'Stalemate' | 'Other' = 'Other';

        if (status === 'Checkmate') {
            end_game_status = 'Checkmate';
            const loserColor = this.chess.turn(); // 'w' or 'b'
            if (loserColor === 'w') {
                winner = currentState.black_player;
                loser = currentState.white_player;
            } else {
                winner = currentState.white_player;
                loser = currentState.black_player;
            }
        } else if (status === 'Stalemate') {
            end_game_status = 'Stalemate';
            // No winner/loser for stalemate
        } else {
            end_game_status = 'Other';
            // For other draws, winner/loser are null
        }

        try {
            await this.auth.client.collection('game_history').create({
                winner: winner,
                loser: loser,
                end_game_status: end_game_status,
            });
            console.log('Game history logged successfully');
        } catch (error) {
            console.error('Failed to log game history:', error);
        }
    }

    async resetGame() {
        this.chess.reset();
        const data = {
            fen: this.chess.fen(),
            pgn: this.chess.pgn(),
            white_player: '',
            black_player: '',
            status: 'New',
        };

        // Check if we have a game ID to update, or create new
        const current = this.gameStateSubject.value;
        if (current?.id) {
            await this.auth.client.collection('game_state').update(current.id, data);
        } else {
            await this.auth.client.collection('game_state').create(data);
        }
    }

    async joinGame(color: 'white' | 'black') {
        const current = this.gameStateSubject.value;
        if (!current) return;

        const userId = this.auth.currentUserId;
        if (!userId) throw new Error('Must be logged in');

        const updateData: any = {};
        if (color === 'white') updateData.white_player = userId;
        if (color === 'black') updateData.black_player = userId;

        await this.auth.client.collection('game_state').update(current.id, updateData);
    }

    // Helper for UI to know valid moves
    getValidMoves(square: string): Move[] {
        return this.chess.moves({ square: square as Square, verbose: true });
    }

    get fen() {
        return this.chess.fen();
    }

    get turn() {
        return this.chess.turn();
    }

    gameHasNotStarted(): boolean {
        const current = this.gameStateSubject.value;
        if (!current) return true;
        return current.status === 'New';
    }

    isMyTurn(): boolean {
        const current = this.gameStateSubject.value;
        if (!current) return false;
        const userId = this.auth.currentUserId;
        if (this.turn === 'w' && current.white_player === userId) return true;
        if (this.turn === 'b' && current.black_player === userId) return true;
        return false;
    }

    getPlayerColor(): 'w' | 'b' | null {
        const current = this.gameStateSubject.value;
        if (!current) return null;
        const userId = this.auth.currentUserId;
        if (current.white_player === userId) return 'w';
        if (current.black_player === userId) return 'b';
        return null;
    }

    isSpectator(): boolean {
        const current = this.gameStateSubject.value;
        if (!current) return true;
        const userId = this.auth.currentUserId;
        if (!userId) return true;

        const isPlayer = current.white_player === userId || current.black_player === userId;
        const isNewGame = current.status === 'New';

        return !isPlayer && !isNewGame;
    }

    isInCheck(): boolean {
        return this.chess.inCheck();
    }

    isCheckmate(): boolean {
        return this.chess.isCheckmate();
    }

    isStalemate(): boolean {
        return this.chess.isStalemate();
    }

    isGameOver(): boolean {
        return this.chess.isGameOver();
    }

    getWinner(): string | null {
        if (!this.chess.isCheckmate()) return null;

        const loserColor = this.chess.turn(); // 'w' or 'b'
        const currentState = this.gameStateSubject.value;
        if (!currentState) return null;

        if (loserColor === 'w') {
            // Black wins
            return currentState.expand?.black_player?.username || 'Black';
        } else {
            // White wins
            return currentState.expand?.white_player?.username || 'White';
        }
    }

    bothPlayersHaveBeenClaimed(): boolean {
        const current = this.gameStateSubject.value;
        return !!(current?.white_player && current?.black_player);
    }
}
