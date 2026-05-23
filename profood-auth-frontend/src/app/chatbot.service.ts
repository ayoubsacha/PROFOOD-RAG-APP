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

export interface ImageAskResponse {
  image_description: string;
  answer: string;
  sources: SourceChunk[];
  session_id: string | null;
}

export interface VoiceTranscribeResponse {
  transcript: string;
}

export interface TtsSpeakResponse {
  audio_url: string;
}

export interface AskStreamPayload {
  question: string;
  session_id?: string | null;
  k?: number | null;
  filters?: Record<string, any> | null;
  voice_mode?: boolean;
}

export interface AskStreamHandlers {
  session?: (sessionId: string) => void;
  chunk?: (text: string) => void;
  sources?: (sources: SourceChunk[]) => void;
  done?: (sessionId?: string) => void;
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

  askImage(imageFile: File, question: string, sessionId?: string | null): Observable<ImageAskResponse> {
    const formData = new FormData();

    formData.append('file', imageFile, imageFile.name);
    formData.append('question', question);
    formData.append('k', '4');

    if (sessionId) {
      formData.append('session_id', sessionId);
    }

    return this.http.post<ImageAskResponse>(
      `${this.ragApiUrl}/image/ask`,
      formData,
      { headers: this.getAuthHeaders() }
    );
  }

  transcribeVoice(audioBlob: Blob, token: string): Observable<VoiceTranscribeResponse> {
    const formData = this.createAudioFormData(audioBlob);

    return this.http.post<VoiceTranscribeResponse>(
      `${this.ragApiUrl}/voice/transcribe`,
      formData,
      { headers: this.getTokenHeaders(token) }
    );
  }

  speakText(text: string): Observable<TtsSpeakResponse> {
    return this.http.post<TtsSpeakResponse>(
      `${this.ragApiUrl}/tts/speak`,
      { text },
      { headers: this.getAuthHeaders() }
    );
  }

  async streamAsk(
    payload: AskStreamPayload,
    handlers: AskStreamHandlers,
    signal?: AbortSignal
  ): Promise<void> {
    const token = this.authService.getToken();

    if (!token) {
      throw new Error('Missing authentication token.');
    }

    const response = await fetch(`${this.ragApiUrl}/ask/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        question: payload.question,
        k: payload.k ?? 4,
        filters: payload.filters ?? null,
        session_id: payload.session_id || null,
        voice_mode: payload.voice_mode === true
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    if (!response.body) {
      throw new Error('Streaming is not supported by this browser.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      buffer = this.processSseBuffer(buffer, handlers);
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      this.processSseBuffer(`${buffer}\n\n`, handlers);
    }
  }

  getAbsoluteAudioUrl(audioUrl?: string | null): string | null {
    if (!audioUrl) return null;

    if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
      return audioUrl;
    }

    return `${this.ragApiUrl}${audioUrl}`;
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

  private getTokenHeaders(token: string): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private processSseBuffer(buffer: string, handlers: AskStreamHandlers): string {
    const events = buffer.split('\n\n');
    const remainder = events.pop() || '';

    for (const rawEvent of events) {
      this.handleSseEvent(rawEvent, handlers);
    }

    return remainder;
  }

  private handleSseEvent(rawEvent: string, handlers: AskStreamHandlers): void {
    const lines = rawEvent.split('\n');
    let eventType = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    const dataText = dataLines.join('\n');
    const data = dataText ? JSON.parse(dataText) : {};

    switch (eventType) {
      case 'session':
        handlers.session?.(data.session_id);
        break;
      case 'chunk':
        handlers.chunk?.(data.text || '');
        break;
      case 'sources':
        handlers.sources?.(data.sources || []);
        break;
      case 'done':
        handlers.done?.(data.session_id);
        break;
      case 'error':
        throw new Error(data.message || 'Streaming failed.');
    }
  }

  private createAudioFormData(audioBlob: Blob): FormData {
    const formData = new FormData();
    const extension = this.getAudioExtension(audioBlob.type);

    formData.append('file', audioBlob, `voice-question.${extension}`);

    return formData;
  }

  private getAudioExtension(contentType: string): string {
    if (contentType.includes('ogg')) return 'ogg';
    if (contentType.includes('mp4')) return 'mp4';
    if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'mp3';
    if (contentType.includes('wav')) return 'wav';

    return 'webm';
  }
}
