import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../auth.service';
import { ChatbotService, SourceChunk } from '../chatbot.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  sources?: SourceChunk[];
}

@Component({
  selector: 'app-chatbot-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot-widget.component.html',
  styleUrl: './chatbot-widget.component.css'
})
export class ChatbotWidgetComponent {
  isOpen = false;
  loading = false;
  question = '';

  messages: ChatMessage[] = [
    {
      role: 'assistant',
      text: 'Bonjour 👋 Je suis l’assistant intelligent de ProFood. Je peux vous aider à choisir des produits, équipements et services professionnels.'
    }
  ];

  constructor(
    private readonly authService: AuthService,
    private readonly chatbotService: ChatbotService
  ) {}

  toggleChat(): void {
    this.isOpen = !this.isOpen;
  }

  sendMessage(): void {
    const cleanQuestion = this.question.trim();

    if (!cleanQuestion || this.loading) return;

    const token = this.authService.getToken();

    if (!token) {
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

    this.chatbotService.ask(cleanQuestion, token).subscribe({
      next: (response) => {
        this.messages.push({
          role: 'assistant',
          text: response.answer,
          sources: response.sources || []
        });
      },

      error: (error) => {
        console.error(error);

        this.messages.push({
          role: 'assistant',
          text: 'Désolé, une erreur est survenue. Vérifiez que FastAPI RAG est lancé sur http://127.0.0.1:8000.'
        });
      },

      complete: () => {
        this.loading = false;
      }
    });
  }
}