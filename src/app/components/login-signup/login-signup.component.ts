import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login-signup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login-signup.component.html',
  styleUrls: ['./login-signup.component.scss']
})
export class LoginSignupComponent {
  email = '';
  password = '';
  isLoginMode = true;
  errorMsg = '';

  constructor(public auth: AuthService) {}

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
}
