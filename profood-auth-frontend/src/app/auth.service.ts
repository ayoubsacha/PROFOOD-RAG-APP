import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  companyName?: string;
  phone?: string;
  isActive?: boolean;
}

export interface AuthResponse {
  message: string;
  access_token: string;
  user: AuthUser;
}

export interface MeResponse {
  user: AuthUser;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly authApiUrl = 'http://localhost:4000/auth';

  private readonly tokenKey = 'profood_auth_token';
  private readonly userKey = 'profood_auth_user';

  constructor(private readonly http: HttpClient) {}

  register(payload: {
    name: string;
    email: string;
    password: string;
    role?: string;
    companyName?: string;
    phone?: string;
  }): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.authApiUrl}/register`, payload)
      .pipe(
        tap((response) =>
          this.saveSession(response.access_token, response.user)
        )
      );
  }

  login(payload: {
    email: string;
    password: string;
  }): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.authApiUrl}/login`, payload)
      .pipe(
        tap((response) =>
          this.saveSession(response.access_token, response.user)
        )
      );
  }

  me(): Observable<MeResponse> {
    const token = this.getToken();

    const headers = token
      ? new HttpHeaders({
          Authorization: `Bearer ${token}`,
        })
      : new HttpHeaders();

    return this.http
      .get<MeResponse>(`${this.authApiUrl}/me`, { headers })
      .pipe(
        tap((response) => this.saveUser(response.user))
      );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getUser(): AuthUser | null {
    const raw = localStorage.getItem(this.userKey);

    if (!raw) return null;

    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  isLoggedIn(): boolean {
    return Boolean(this.getToken());
  }

  private saveSession(token: string, user: AuthUser): void {
    localStorage.setItem(this.tokenKey, token);
    this.saveUser(user);
  }

  private saveUser(user: AuthUser): void {
    localStorage.setItem(this.userKey, JSON.stringify(user));
  }
}