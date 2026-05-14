import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface SourceChunk {
  source?: string;
  page?: number;
  doc_type?: string;
  preview: string;
  metadata: any;
}

export interface AskResponse {
  answer: string;
  sources: SourceChunk[];
}

@Injectable({
  providedIn: 'root'
})
export class ChatbotService {
  private readonly ragApiUrl = 'http://127.0.0.1:8000';

  constructor(private readonly http: HttpClient) {}

  ask(question: string, token: string): Observable<AskResponse> {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    return this.http.post<AskResponse>(
      `${this.ragApiUrl}/ask`,
      {
        question,
        k: 4,
        filters: null,
      },
      { headers }
    );
  }
}