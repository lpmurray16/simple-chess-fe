import { Component, EventEmitter, Output, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HistoryService } from '../../services/history.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-game-history-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game-history-modal.component.html',
  styleUrls: ['./game-history-modal.component.scss']
})
export class GameHistoryModalComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  
  historyService = inject(HistoryService);
  auth = inject(AuthService);
  
  ngOnInit() {
    this.historyService.fetchHistory();
  }

  onClose() {
    this.close.emit();
  }

  getWinnerName(record: any): string {
    if (record.end_game_status === 'Stalemate' || record.end_game_status === 'Other') {
        return 'Draw';
    }
    return record.expand?.winner?.name || record.expand?.winner?.username || 'Unknown';
  }

  getLoserName(record: any): string {
    return record.expand?.loser?.name || record.expand?.loser?.username || 'Unknown';
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'Checkmate': return 'fa-solid fa-crown';
      case 'Stalemate': return 'fa-solid fa-handshake';
      default: return 'fa-solid fa-flag';
    }
  }
}
