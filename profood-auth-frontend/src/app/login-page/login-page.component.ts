import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthResponse, AuthService } from '../auth.service';

type Tab = 'login' | 'register';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.css'
})
export class LoginPageComponent implements OnInit {
  activeTab: Tab = 'login';
  loading = false;
  result = '';

  registerForm = {
    name: '',
    email: '',
    password: '',
    role: 'CLIENT',
    companyName: '',
    phone: ''
  };

  loginForm = {
    email: '',
    password: ''
  };

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/chat']);
    }
  }

  switchTab(tab: Tab): void {
    this.activeTab = tab;
    this.result = '';
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
      next: (response) => this.handleSuccess(response),
      error: (error) => this.handleError(error),
      complete: () => (this.loading = false)
    });
  }

  private handleSuccess(_response: AuthResponse): void {
    this.result = '';
    this.router.navigate(['/chat']);
  }

  private handleError(error: HttpErrorResponse): void {
    this.loading = false;

    const message = error.error?.message || error.message || 'Unknown error';
    this.result = message;
  }
}
