import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../auth.service';
import {
  AskResponse,
  ChatSession,
  ChatSessionSummary,
  ChatbotService,
  SourceChunk
} from '../chatbot.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  sources?: SourceChunk[];
}

const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  text: 'Bonjour. Je suis l assistant intelligent de ProFood. Posez une question sur les produits, equipements ou services professionnels.'
};

@Component({
  selector: 'app-chatbot-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot-widget.component.html',
  styleUrl: './chatbot-widget.component.css'
})
export class ChatbotWidgetComponent implements OnInit {
  isOpen = false;
  loading = false;
  sessionsLoading = false;
  question = '';
  statusMessage = '';

  currentSessionId: string | null = null;
  sessions: ChatSessionSummary[] = [];
  messages: ChatMessage[] = [{ ...WELCOME_MESSAGE }];

  constructor(
    private readonly authService: AuthService,
    private readonly chatbotService: ChatbotService
  ) {}

  ngOnInit(): void {
    this.loadSessions();
  }

  get currentSessionTitle(): string {
    const session = this.sessions.find((item) => item.id === this.currentSessionId);
    return session?.title || 'New conversation';
  }

  toggleChat(): void {
    this.isOpen = !this.isOpen;

    if (this.isOpen) {
      this.loadSessions();
    }
  }

  startNewSession(): void {
    if (this.loading || this.sessionsLoading) return;

    this.sessionsLoading = true;

    this.chatbotService.createSession('New chat').subscribe({
      next: (session) => {
        this.sessions = [session, ...this.sessions.filter((item) => item.id !== session.id)];
        this.currentSessionId = session.id;
        this.messages = [{ ...WELCOME_MESSAGE }];
        this.statusMessage = 'New session ready.';
      },
      error: (error: unknown) => this.handleSessionError(error),
      complete: () => (this.sessionsLoading = false)
    });
  }

  selectSession(sessionId: string): void {
    if (this.currentSessionId === sessionId || this.sessionsLoading) return;

    this.sessionsLoading = true;

    this.chatbotService.getSession(sessionId).subscribe({
      next: (session) => this.applySession(session),
      error: (error: unknown) => this.handleSessionError(error),
      complete: () => (this.sessionsLoading = false)
    });
  }

  deleteCurrentSession(): void {
    if (!this.currentSessionId || this.sessionsLoading) return;

    const sessionId = this.currentSessionId;
    this.sessionsLoading = true;

    this.chatbotService.deleteSession(sessionId).subscribe({
      next: () => {
        this.sessions = this.sessions.filter((session) => session.id !== sessionId);
        this.currentSessionId = null;
        this.messages = [{ ...WELCOME_MESSAGE }];
        this.statusMessage = 'Session deleted.';
      },
      error: (error: unknown) => this.handleSessionError(error),
      complete: () => (this.sessionsLoading = false)
    });
  }

  sendMessage(): void {
    const cleanQuestion = this.question.trim();

    if (!cleanQuestion || this.loading) return;

    if (!this.authService.getToken()) {
      this.messages.push({
        role: 'assistant',
        text: 'Vous devez vous connecter pour utiliser le chatbot ProFood.'
      });

      return;
    }

    this.messages.push({
      role: 'user',
      text: cleanQuestion
    });

    this.question = '';
    this.loading = true;
    this.statusMessage = '';

    this.chatbotService.ask(cleanQuestion, this.currentSessionId).subscribe({
      next: (response: AskResponse) => {
        this.currentSessionId = response.session_id;

        this.messages.push({
          role: 'assistant',
          text: response.answer,
          sources: response.sources || []
        });

        this.loadSessions();
      },
      error: (error: unknown) => {
        console.error(error);

        this.messages.push({
          role: 'assistant',
          text: 'Desole, une erreur est survenue. Verifiez que FastAPI RAG est lance sur http://127.0.0.1:8000.'
        });
      },
      complete: () => {
        this.loading = false;
      }
    });
  }

  private loadSessions(): void {
    if (!this.authService.getToken()) return;

    this.sessionsLoading = true;

    this.chatbotService.getSessions().subscribe({
      next: (sessions) => {
        this.sessions = sessions;
      },
      error: (error: unknown) => this.handleSessionError(error),
      complete: () => (this.sessionsLoading = false)
    });
  }

  private applySession(session: ChatSession): void {
    this.currentSessionId = session.id;
    this.statusMessage = '';

    this.messages = session.messages.length
      ? session.messages.map((message) => ({
          role: message.role,
          text: message.content,
          sources: message.sources || []
        }))
      : [{ ...WELCOME_MESSAGE }];
  }

  private handleSessionError(error: unknown): void {
    console.error(error);
    this.statusMessage = 'Unable to load chat sessions.';
  }
}
