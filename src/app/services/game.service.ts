import { Injectable, NgZone } from '@angular/core';
import { AuthService } from './auth.service';
import { BehaviorSubject, Observable } from 'rxjs';
import { Chess, Square, Move } from 'chess.js';

export type GameStatus =
  | 'New'
  | 'White Move'
  | 'Black Move'
  | 'In Check'
  | 'Checkmate'
  | 'Stalemate';

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

  private chess = new Chess();

  constructor(
    private auth: AuthService,
    private ngZone: NgZone,
  ) {
    this.initGameSubscription();
  }

  private async initGameSubscription() {
    // Subscribe to the games collection
    // We assume there is only one game for simplicity as requested.
    // If no game exists, we might need to create one, or wait for one.

    // First, try to fetch the existing game (blocking load)
    await this.fetchOrCreateGame(false);

    // Subscribe to changes
    this.auth.client.collection('game_state').subscribe('*', (e) => {
      if (e.action === 'update' || e.action === 'create') {
        // We need to fetch the full record again to get expanded relations
        // This is a background update, so don't show full page loader
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

  private updateLocalState(record: any) {
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

    // Sync internal chess logic FIRST
    // We prioritize PGN to preserve move history and repetition state
    try {
      if (state.pgn) {
        console.log('Loading PGN:', state.pgn);
        this.chess.loadPgn(state.pgn);
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
    } else if (this.chess.inCheck()) {
      status = 'In Check';
    }

    // Update backend
    await this.auth.client.collection('game_state').update(currentState.id, {
      fen: this.chess.fen(),
      pgn: this.chess.pgn(),
      status: status,
    });
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
}
