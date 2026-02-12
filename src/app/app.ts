import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardComponent } from './components/board/board.component';
import { LoginSignupComponent } from './components/login-signup/login-signup.component';
import { OverlayComponent } from './components/overlay/overlay.component';
import { MessageModalComponent } from './components/message-modal/message-modal.component';
import { GameHistoryModalComponent } from './components/game-history-modal/game-history-modal.component';
import { AuthService } from './services/auth.service';
import { GameService } from './services/game.service';
import { MessageService } from './services/message.service';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        BoardComponent,
        LoginSignupComponent,
        OverlayComponent,
        MessageModalComponent,
        GameHistoryModalComponent,
    ],
    templateUrl: './app.html',
    styleUrl: './app.scss',
})
export class App implements OnInit {
    menuOpen = false;
    showAuth = !inject(AuthService).isValid;
    showMessages = false;
    showHistory = false;
    showResetConfirmation = false;
    gameService = inject(GameService);
    messageService = inject(MessageService);

    get isAdmin() {
        return this.auth.currentUserId === 'x3eeoz1leai6l4h';
    }

    constructor(public auth: AuthService) {
        // If user logs in, hide auth overlay
        this.auth.currentUser$.subscribe((user) => {
            if (user) {
                this.showAuth = false;
            } else {
                // Enforce login if not authenticated
                this.showAuth = true;
            }
        });

        // Listen for login requests
        this.auth.requestLogin$.subscribe((requested) => {
            if (requested) {
                this.showAuth = true;
            }
        });
    }

    ngOnInit() {}

    toggleMenu() {
        this.menuOpen = !this.menuOpen;
    }

    toggleAuth() {
        this.showAuth = !this.showAuth;
        if (this.showAuth) {
            this.menuOpen = false;
        }
    }

    toggleMessages() {
        this.showMessages = !this.showMessages;
        if (this.showMessages) {
            this.menuOpen = false;
        }
    }

    toggleHistory() {
        this.showHistory = !this.showHistory;
        if (this.showHistory) {
            this.menuOpen = false;
        }
    }

    logout() {
        this.auth.logout();
        this.menuOpen = false;
    }

    resetGame() {
        this.showResetConfirmation = true;
        this.menuOpen = false;
    }

    async confirmReset() {
        this.showResetConfirmation = false;
        await this.gameService.resetGame();
    }

    async clearMessages() {
        if (confirm('Are you sure you want to clear ALL messages?')) {
            await this.messageService.clearAllMessages();
            this.menuOpen = false;
        }
    }

    cancelReset() {
        this.showResetConfirmation = false;
    }
}
