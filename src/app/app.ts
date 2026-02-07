import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardComponent } from './components/board/board.component';
import { LoginSignupComponent } from './components/login-signup/login-signup.component';
import { OverlayComponent } from './components/overlay/overlay.component';
import { AuthService } from './services/auth.service';
import { GameService } from './services/game.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, BoardComponent, LoginSignupComponent, OverlayComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  menuOpen = false;
  gameService = inject(GameService);

  constructor(public auth: AuthService) {}

  ngOnInit() {}

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  logout() {
    this.auth.logout();
  }
}
