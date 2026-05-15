import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { AuthService } from './auth.service';

export interface SourceChunk {
  source?: string;
  page?: number | null;
  doc_type?: string;
  preview: string;
  metadata: any;
}

export interface AskResponse {
  answer: string;
  sources: SourceChunk[];
  session_id: string;
}

export interface ChatSessionMessage {
  role: 'user' | 'assistant';
  content: string;
  sources: SourceChunk[];
  created_at: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  user_id: string;
  message_count: number;
  last_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatSession extends ChatSessionSummary {
  messages: ChatSessionMessage[];
}

@Injectable({
  providedIn: 'root'
})
export class ChatbotService {
  private readonly ragApiUrl = 'http://127.0.0.1:8000';

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService
  ) {}

  ask(question: string, sessionId?: string | null): Observable<AskResponse> {
    return this.http.post<AskResponse>(
      `${this.ragApiUrl}/ask`,
      {
        question,
        k: 4,
        filters: null,
        session_id: sessionId || null
      },
      { headers: this.getAuthHeaders() }
    );
  }

  createSession(title?: string): Observable<ChatSession> {
    return this.http.post<ChatSession>(
      `${this.ragApiUrl}/chat/sessions`,
      { title: title || null },
      { headers: this.getAuthHeaders() }
    );
  }

  getSessions(): Observable<ChatSessionSummary[]> {
    return this.http.get<ChatSessionSummary[]>(
      `${this.ragApiUrl}/chat/sessions`,
      { headers: this.getAuthHeaders() }
    );
  }

  getSession(sessionId: string): Observable<ChatSession> {
    return this.http.get<ChatSession>(
      `${this.ragApiUrl}/chat/sessions/${sessionId}`,
      { headers: this.getAuthHeaders() }
    );
  }

  deleteSession(sessionId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.ragApiUrl}/chat/sessions/${sessionId}`,
      { headers: this.getAuthHeaders() }
    );
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken();

    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }
}
