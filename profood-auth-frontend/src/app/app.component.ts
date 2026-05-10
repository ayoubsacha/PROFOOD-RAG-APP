import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthResponse, AuthService, AuthUser, MeResponse } from './auth.service';

type Tab = 'login' | 'register';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  activeTab: Tab = 'login';
  loading = false;

  registerForm = {
    name: '',
    email: '',
    password: ''
  };

  loginForm = {
    email: '',
    password: ''
  };

  result = 'Result will appear here...';

  constructor(private readonly authService: AuthService) {}

  get token(): string | null {
    return this.authService.getToken();
  }

  get user(): AuthUser | null {
    return this.authService.getUser();
  }

  get loggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  get tokenPreview(): string {
    return this.token ? `${this.token.slice(0, 45)}...` : 'No token';
  }

  switchTab(tab: Tab): void {
    this.activeTab = tab;
  }

  register(): void {
    this.loading = true;
    this.authService.register(this.registerForm).subscribe({
      next: (response) => this.handleSuccess(response),
      error: (error) => this.handleError(error),
      complete: () => (this.loading = false)
    });
  }

  login(): void {
  this.loading = true;

  this.authService.login(this.loginForm).subscribe({
    next: (response) => {
      this.handleSuccess(response);

      // Redirect to the RAG app after successful login
      window.location.href = 'http://127.0.0.1:8000';
    },
    error: (error) => this.handleError(error),
    complete: () => (this.loading = false)
  });
}
  getMe(): void {
    this.loading = true;
    this.authService.me().subscribe({
      next: (response: MeResponse) => {
        this.result = JSON.stringify(response, null, 2);
      },
      error: (error) => this.handleError(error),
      complete: () => (this.loading = false)
    });
  }

  logout(): void {
    this.authService.logout();
    this.result = 'Logged out successfully.';
  }

  private handleSuccess(response: AuthResponse): void {
    this.result = JSON.stringify(response, null, 2);
  }

  private handleError(error: HttpErrorResponse): void {
    this.loading = false;
    const message = error.error || { message: error.message || 'Unknown error' };
    this.result = JSON.stringify(message, null, 2);
  }
}
