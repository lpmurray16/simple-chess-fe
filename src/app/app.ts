import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BoardComponent } from './components/board/board.component';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, BoardComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  email = '';
  password = '';
  isLoginMode = true;
  errorMsg = '';

  constructor(public auth: AuthService) {}

  ngOnInit() {
  }

  async onSubmit() {
    this.errorMsg = '';
    try {
      if (this.isLoginMode) {
        await this.auth.login(this.email, this.password);
      } else {
        await this.auth.signup(this.email, this.password);
        await this.auth.login(this.email, this.password);
      }
    } catch (err: any) {
      this.errorMsg = err.message || 'Authentication failed';
    }
  }

  toggleMode() {
    this.isLoginMode = !this.isLoginMode;
    this.errorMsg = '';
  }

  logout() {
    this.auth.logout();
  }
}
