import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../../services/game.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './overlay.component.html',
  styleUrls: ['./overlay.component.scss'],
})
export class OverlayComponent implements OnInit, OnDestroy {
  isVisible = false;
  currentGifUrl: string = '';
  private captureSub: Subscription | null = null;
  private timer: any = null;

  private gifOptions = [
    'https://metoobubba16.sirv.com/chess_gifs/hp-rook-explodes.gif',
    'https://metoobubba16.sirv.com/chess_gifs/hp-ron-goes-down.gif',
    'https://metoobubba16.sirv.com/chess_gifs/hp-red-white-clip.gif',
    'https://metoobubba16.sirv.com/chess_gifs/b-rook-v-w-rook.gif',
    'https://metoobubba16.sirv.com/chess_gifs/b-rook-v-w-castle.gif',
    'https://metoobubba16.sirv.com/chess_gifs/2-rooks-w-wins.gif',
  ];

  constructor(
    private gameService: GameService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.captureSub = this.gameService.capture$.subscribe(() => {
      this.triggerOverlay();
    });
  }

  ngOnDestroy() {
    this.captureSub?.unsubscribe();
    this.clearTimer();
  }

  triggerOverlay() {
    // Pick random GIF
    const randomIndex = Math.floor(Math.random() * this.gifOptions.length);
    this.currentGifUrl = this.gifOptions[randomIndex];

    this.isVisible = true;
    this.cdr.detectChanges();
    this.clearTimer();

    // Hide after 5 seconds
    this.timer = setTimeout(() => {
      this.isVisible = false;
      this.cdr.detectChanges();
    }, 7000);
  }

  closeOverlay() {
    this.isVisible = false;
    this.clearTimer();
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
