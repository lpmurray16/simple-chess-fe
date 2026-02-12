import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';

export interface GameHistoryRecord {
  id: string;
  winner: string | null;
  loser: string | null;
  end_game_status: 'Stalemate' | 'Checkmate' | 'Other';
  created: string;
  expand?: {
    winner?: {
      name: string;
      email: string;
      username: string;
    };
    loser?: {
      name: string;
      email: string;
      username: string;
    };
  };
}

@Injectable({
  providedIn: 'root',
})
export class HistoryService {
  private historySubject = new BehaviorSubject<GameHistoryRecord[]>([]);
  public history$ = this.historySubject.asObservable();

  constructor(private auth: AuthService) {
    this.auth.currentUser$.subscribe((user) => {
      if (user) {
        this.fetchHistory();
      } else {
        this.historySubject.next([]);
      }
    });
  }

  public async fetchHistory() {
    try {
      const records = await this.auth.client.collection('game_history').getList(1, 50, {
        sort: '-created',
        expand: 'winner,loser',
      });

      this.historySubject.next(records.items as unknown as GameHistoryRecord[]);
    } catch (error) {
      console.error('Error fetching game history:', error);
    }
  }
}
