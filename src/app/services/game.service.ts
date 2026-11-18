import { Injectable, NgZone, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { BehaviorSubject, Subject } from 'rxjs';
import { Chess, Square, Move } from 'chess.js';
import { NotificationService } from './notification.service';
import { ToastService } from './toast.service';

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
    private lastStatus: GameStatus | null = null;
    private readonly submitting = signal(false);
    get isSubmitting(): boolean { return this.submitting(); }
    private set isSubmitting(value: boolean) { this.submitting.set(value); }
    public hasMoveHistory = true;
    private needsRefresh = false;
    private session = 0;
    private sessionUserId: string | null = null;
    private revision = 0;
    private fetchSequence = 0;
    private refreshQueued = false;
    private serverUpdated = '';
    private unsubscribeGame: (() => void | Promise<void>) | null = null;

    constructor(
        private auth: AuthService,
        private ngZone: NgZone,
        private notificationService: NotificationService,
        private toastService: ToastService,
    ) {
        this.auth.currentUser$.subscribe((user) => {
            const userId = user?.id || null;
            if (userId === this.sessionUserId) {
                if (!userId) this.isLoadingSubject.next(false);
                else if (!this.isSubscribed) void this.initGameSubscription();
                return;
            }
            this.sessionUserId = userId;
            ++this.session;
            ++this.revision;
            ++this.fetchSequence;
            const unsubscribe = this.unsubscribeGame;
            this.unsubscribeGame = null;
            if (unsubscribe) void Promise.resolve().then(unsubscribe).catch(console.error);
            this.isSubscribed = false;
            this.isSubmitting = false;
            this.needsRefresh = false;
            this.refreshQueued = false;
            this.serverUpdated = '';
            this.lastStatus = null;
            this.chess = new Chess();
            this.hasMoveHistory = true;
            this.gameStateSubject.next(null);
            this.errorSubject.next(null);
            this.isLoadingSubject.next(!!userId);
            if (userId) void this.initGameSubscription();
        });
    }

    private isCurrentSession(session: number): boolean {
        return session === this.session && this.auth.isValid &&
            !!this.sessionUserId && this.auth.currentUserId === this.sessionUserId;
    }

    private async initGameSubscription() {
        if (!this.auth.isValid || this.isSubscribed) return;
        const session = this.session;
        this.isSubscribed = true;
        try {
            const unsubscribe = await this.auth.client.collection('game_state').subscribe('*', (e) => {
                if (this.isCurrentSession(session) && (e.action === 'update' || e.action === 'create')) {
                    void this.fetchOrCreateGame(true);
                }
            });
            if (!this.isCurrentSession(session)) {
                await unsubscribe();
                return;
            }
            this.unsubscribeGame = unsubscribe;
        } catch (error) {
            if (!this.isCurrentSession(session)) return;
            this.isSubscribed = false;
            console.error('Failed to subscribe to game updates:', error);
            this.toastService.warning('Live updates unavailable. Refresh to sync the board.');
        }
        if (this.isCurrentSession(session)) await this.fetchOrCreateGame(false);
    }

    private async fetchOrCreateGame(isBackground = false) {
        if (!this.auth.isValid) return;
        if (this.isSubmitting) {
            this.refreshQueued = true;
            return;
        }
        const session = this.session;
        const revision = this.revision;
        const request = ++this.fetchSequence;
        const isCurrent = () => this.isCurrentSession(session) &&
            request === this.fetchSequence && revision === this.revision;
        if (!isBackground) this.isLoadingSubject.next(true);
        try {
            const list = await this.auth.client.collection('game_state').getList(1, 1, {
                sort: '-created',
                expand: 'white_player,black_player',
            });
            if (!isCurrent()) return;
            if (list.items.length) {
                if (this.updateLocalState(list.items[0], true)) {
                    this.needsRefresh = false;
                    this.errorSubject.next(null);
                }
            } else if (!this.gameStateSubject.value && !this.needsRefresh) {
                await this.resetGame();
            } else {
                throw new Error('Game unavailable. Refresh before playing.');
            }
        } catch (error) {
            if (!isCurrent()) return;
            console.error('Error fetching game:', error);
            this.errorSubject.next('Unable to refresh the game. Please try again.');
            if (this.needsRefresh || !isBackground) {
                this.toastService.error('Unable to refresh the game. Please try again.');
            }
        } finally {
            if (this.isCurrentSession(session) && request === this.fetchSequence) {
                this.ngZone.run(() => this.isLoadingSubject.next(false));
            }
        }
    }

    async refreshGame() {
        await this.fetchOrCreateGame(true);
    }

    // A PGN must describe the saved FEN and start at the initial position to
    // represent complete history. Setup/FEN PGNs preserve known moves, but not
    // unknown earlier moves (or repetition information).
    private engineFor(state: Pick<GameState, 'fen' | 'pgn'>): { chess: Chess; complete: boolean } {
        const fallback = new Chess(state.fen);
        if (state.pgn?.trim()) {
            try {
                const candidate = new Chess();
                candidate.loadPgn(state.pgn);
                if (candidate.fen() === fallback.fen()) {
                    const history = candidate.history({ verbose: true });
                    const initial = new Chess().fen();
                    return {
                        chess: candidate,
                        complete: history.length ? history[0].before === initial : candidate.fen() === initial,
                    };
                }
            } catch (error) {
                console.warn('Invalid PGN; using saved FEN:', error);
            }
        }
        return { chess: fallback, complete: fallback.fen() === new Chess().fen() };
    }

    private updateLocalState(record: any, shouldCheckCapture = false): boolean {
        const previous = this.gameStateSubject.value;
        if (previous?.id === record.id && record.updated && this.serverUpdated &&
            record.updated < this.serverUpdated) return false;
        const { chess, complete } = this.engineFor(record);
        const history = chess.history({ verbose: true });
        const lastMove = history[history.length - 1];
        const state: GameState = {
            id: record.id,
            fen: chess.fen(),
            pgn: record.pgn || '',
            white_player: record.white_player,
            black_player: record.black_player,
            expand: {
                white_player: record.expand?.white_player ??
                    (previous && previous.id === record.id && previous.white_player === record.white_player
                        ? previous.expand?.white_player : undefined),
                black_player: record.expand?.black_player ??
                    (previous && previous.id === record.id && previous.black_player === record.black_player
                        ? previous.expand?.black_player : undefined),
            },
            status: record.status,
            lastMove: lastMove ? { from: lastMove.from, to: lastMove.to } : null,
        };
        // Only animate a newly accepted capture directly following our displayed
        // position. The HTTP response and realtime echo therefore cannot double-fire.
        const captured = shouldCheckCapture && previous?.id === state.id &&
            previous.fen !== state.fen && lastMove?.before === previous.fen && !!lastMove.captured;
        const oldStatus = previous?.id === state.id ? this.lastStatus : null;
        this.chess = chess;
        this.hasMoveHistory = complete;
        this.serverUpdated = record.updated || '';
        this.lastStatus = state.status;
        ++this.revision;
        this.ngZone.run(() => {
            this.gameStateSubject.next(state);
            if (captured) this.capture$.next();
            if (oldStatus && oldStatus !== state.status) this.showStatusToast(state.status);
        });
        return true;
    }

    private canSubmit(): boolean {
        if (this.isSubmitting) return false;
        if (!this.auth.isValid || !this.auth.currentUserId) {
            this.toastService.error('Please log in before playing.');
            return false;
        }
        if (this.needsRefresh) {
            this.toastService.error('Game sync is uncertain. Refresh successfully before playing.');
            return false;
        }
        return true;
    }

    private beginSubmission(): number {
        this.isSubmitting = true;
        ++this.revision; // Invalidate reads started before this write.
        ++this.fetchSequence;
        return this.session;
    }

    private finishSubmission(session: number) {
        if (!this.isCurrentSession(session)) return;
        this.isSubmitting = false;
        this.isLoadingSubject.next(false);
        if (this.refreshQueued) {
            this.refreshQueued = false;
            void this.fetchOrCreateGame(true);
        }
    }

    private async reconcileSave(session: number, id?: string): Promise<GameState | null> {
        if (!this.isCurrentSession(session)) return null;
        this.needsRefresh = true;
        try {
            // Do not retry a write: a transport error can mean it already committed.
            const collection = this.auth.client.collection('game_state');
            const record = id
                ? await collection.getOne(id, { expand: 'white_player,black_player' })
                : (await collection.getList(1, 1, {
                    sort: '-created', expand: 'white_player,black_player',
                })).items[0];
            if (!this.isCurrentSession(session)) return null;
            if (!record || !this.updateLocalState(record, true)) throw new Error('No fresh game state');
            this.needsRefresh = false;
            this.errorSubject.next(null);
            return this.gameStateSubject.value;
        } catch (error) {
            if (!this.isCurrentSession(session)) return null;
            console.error('Unable to reconcile save:', error);
            this.errorSubject.next('Save outcome unknown. Refresh before playing.');
            this.toastService.error('Save outcome unknown. Refresh successfully before playing again.');
            return null;
        }
    }

    async makeMove(from: string, to: string, promotion = 'q') {
        if (!this.canSubmit()) return;
        const current = this.gameStateSubject.value;
        if (!current) return;
        if (this.isGameOver()) {
            this.toastService.info('This game has ended. Reset to play again.');
            return;
        }
        if (!this.isMyTurn() || !this.bothPlayersHaveBeenClaimed()) {
            this.toastService.error('Wait for both players and your turn.');
            return;
        }
        let candidate: Chess;
        try {
            candidate = this.engineFor(current).chess;
            if (!candidate.move({ from, to, promotion })) throw new Error('Invalid move');
        } catch (error) {
            this.toastService.error('Invalid move. Please choose a legal move.');
            return;
        }
        const status: GameStatus = candidate.isCheckmate() ? 'Checkmate'
            : candidate.isStalemate() ? 'Stalemate'
            : candidate.isDraw() ? 'Draw'
            : candidate.inCheck() ? 'In Check'
            : candidate.turn() === 'w' ? 'White Move' : 'Black Move';
        const data = { fen: candidate.fen(), pgn: candidate.pgn(), status };
        const session = this.beginSubmission();
        const revision = this.revision;
        let saved: GameState | null = null;
        try {
            const record = await this.auth.client.collection('game_state').update(current.id, data, {
                expand: 'white_player,black_player',
            });
            if (!this.isCurrentSession(session) || revision !== this.revision) return;
            if (this.updateLocalState(record, true)) saved = { ...current, ...data };
        } catch (error) {
            if (!this.isCurrentSession(session)) return;
            console.error('Move save failed; checking server:', error);
            const reconciled = await this.reconcileSave(session, current.id);
            if (reconciled?.fen === data.fen && reconciled.pgn === data.pgn && reconciled.status === status) {
                saved = { ...current, ...data };
            } else if (reconciled) {
                this.toastService.error('Move was not confirmed. Board refreshed from the server.');
            }
        } finally {
            this.finishSubmission(session);
        }
        if (!saved || !this.isCurrentSession(session)) return;
        // These side effects must never turn an accepted move into a move error.
        const opponentId = current.white_player === this.sessionUserId ? current.black_player : current.white_player;
        if (opponentId && !candidate.isGameOver()) {
            void Promise.resolve().then(() => {
                if (this.isCurrentSession(session)) return this.notificationService.sendTurnNotification(opponentId);
                return undefined;
            }).catch(error => console.error('Move saved, notification failed:', error));
        }
        if (candidate.isGameOver()) await this.logGameHistory(saved, candidate.turn());
    }

        private showStatusToast(status: GameStatus) {
            const playerColor = this.getPlayerColor();
            // Terminal guards in isMyTurn() must not hide who lost checkmate.
            const isMyTurn = playerColor === this.chess.turn();
        
            switch (status) {
                case 'Checkmate':
                    if (isMyTurn) {
                        this.toastService.error('Checkmate! You lost.');
                    } else if (playerColor) {
                        this.toastService.success('Checkmate! You won! 🎉');
                    } else {
                        this.toastService.info('Game over: Checkmate');
                    }
                    break;
                case 'Stalemate':
                    this.toastService.info('Stalemate! Game drawn.');
                    break;
                case 'Draw':
                    this.toastService.info('Game drawn.');
                    break;
                case 'In Check':
                    if (isMyTurn) {
                        this.toastService.warning('You are in check! ♛');
                    }
                    break;
                case 'White Move':
                case 'Black Move':
                    if (isMyTurn) {
                        this.toastService.success('Your turn!');
                    }
                    break;
            }
        }

    private async logGameHistory(currentState: GameState, loserColor: 'w' | 'b') {
        const status = currentState.status;

        let winner: string | null = null;
        let loser: string | null = null;
        let end_game_status: 'Checkmate' | 'Stalemate' | 'Other' = 'Other';

        if (status === 'Checkmate') {
            end_game_status = 'Checkmate';
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
        if (!this.canSubmit()) return;
        const candidate = new Chess();
        const data = {
            fen: candidate.fen(), pgn: candidate.pgn(),
            white_player: '', black_player: '', status: 'New' as GameStatus,
        };
        await this.saveGameChange(data, 'Game reset! New board ready.');
    }

    async joinGame(color: 'white' | 'black') {
        if (!this.canSubmit()) return;
        const current = this.gameStateSubject.value;
        if (!current) return;
        if (this.isGameOver()) {
            this.toastService.info('This game has ended. Reset to play again.');
            return;
        }
        const userId = this.auth.currentUserId;
        const occupied = color === 'white' ? current.white_player : current.black_player;
        const other = color === 'white' ? current.black_player : current.white_player;
        if ((occupied && occupied !== userId) || other === userId) {
            this.toastService.error('That seat is unavailable, or you already joined the other side.');
            return;
        }
        if (occupied === userId) return;
        const data = color === 'white' ? { white_player: userId } : { black_player: userId };
        await this.saveGameChange(data, `Joined as ${color}!`);
    }

    private async saveGameChange(data: Partial<GameState>, message: string) {
        const current = this.gameStateSubject.value;
        const session = this.beginSubmission();
        const revision = this.revision;
        try {
            const collection = this.auth.client.collection('game_state');
            const options = { expand: 'white_player,black_player' };
            const record = current
                ? await collection.update(current.id, data, options)
                : await collection.create(data, options);
            if (!this.isCurrentSession(session) || revision !== this.revision) return;
            if (this.updateLocalState(record)) this.toastService.success(message);
        } catch (error) {
            if (!this.isCurrentSession(session)) return;
            console.error('Game change failed; checking server:', error);
            const reconciled = await this.reconcileSave(session, current?.id);
            if (reconciled) {
                const accepted = Object.entries(data).every(([key, value]) =>
                    reconciled[key as keyof GameState] === value);
                if (accepted) this.toastService.success(message);
                else this.toastService.error('Change was not confirmed. Board refreshed from the server.');
            }
        } finally {
            this.finishSubmission(session);
        }
    }

    getMoveHistory(): Move[] {
        return this.hasMoveHistory ? this.chess.history({ verbose: true }) : [];
    }

    // Helper for UI to know valid moves
    getValidMoves(square: string): Move[] {
        if (this.isSubmitting || this.needsRefresh || this.isGameOver()) return [];
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
        if (!current || this.needsRefresh || this.isGameOver()) return false;
        const userId = this.auth.currentUserId;
        if (!this.auth.isValid || !userId) return false;
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
        const status = this.gameStateSubject.value?.status;
        return status === 'Checkmate' || status === 'Stalemate' || status === 'Draw' || this.chess.isGameOver();
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
