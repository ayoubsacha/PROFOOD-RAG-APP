import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../auth.service';
import {
  AskResponse,
  ChatSession,
  ChatSessionSummary,
  ChatbotService,
  SourceChunk,
  VoiceTranscribeResponse
} from '../chatbot.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  sources?: SourceChunk[];
}

type VoiceRecordingMode = 'dictate' | 'voice-chat';

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
  dictationLoading = false;
  voiceChatLoading = false;
  sessionsLoading = false;
  question = '';
  statusMessage = '';
  recordingMode: VoiceRecordingMode | null = null;
  voiceConversationActive = false;
  assistantSpeaking = false;

  currentSessionId: string | null = null;
  sessions: ChatSessionSummary[] = [];
  messages: ChatMessage[] = [];
  private readonly silenceThreshold = 0.03;
  private readonly silenceDelayMs = 900;
  private readonly maxIdleRecordingMs = 5000;
  private readonly maxRecordingMs = 15000;
  private audioStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private assistantAudio: HTMLAudioElement | null = null;
  private voiceRestartTimerId: number | null = null;
  private silenceFrameId: number | null = null;
  private speechDetected = false;
  private silenceStartedAt: number | null = null;
  private recordingStartedAt = 0;
  private shouldProcessRecording = true;
  private voiceLoopId = 0;
  private recordedChunks: Blob[] = [];

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

  get isBusy(): boolean {
    return this.loading || this.dictationLoading || this.voiceChatLoading;
  }

  get isVoiceActive(): boolean {
    return this.voiceConversationActive || this.recordingMode === 'voice-chat' || this.voiceChatLoading || this.assistantSpeaking;
  }

  get voiceStateLabel(): string {
    if (this.recordingMode === 'voice-chat') return 'A l ecoute';
    if (this.voiceChatLoading) return 'Traitement';
    if (this.assistantSpeaking) return 'Reponse vocale';
    if (this.voiceConversationActive) return 'Pret';

    return 'Mode vocal';
  }

  get displayName(): string {
    const user = this.authService.getUser();
    const name = user?.name || user?.email?.split('@')[0] || 'user';

    return name.trim().split(/\s+/)[0] || 'user';
  }

  get userInitial(): string {
    return this.displayName.charAt(0).toUpperCase();
  }

  get showWelcomeState(): boolean {
    return this.messages.length === 0;
  }

  toggleChat(): void {
    this.isOpen = !this.isOpen;

    if (!this.isOpen) {
      this.stopVoiceConversation();

      if (this.recordingMode === 'dictate') {
        this.stopRecording(false);
      }
    }

    if (this.isOpen) {
      this.loadSessions();
    }
  }

  startNewSession(): void {
    if (this.loading || this.sessionsLoading) return;

    this.stopVoiceConversation();
    this.sessionsLoading = true;

    this.chatbotService.createSession('New chat').subscribe({
      next: (session) => {
        this.sessions = [session, ...this.sessions.filter((item) => item.id !== session.id)];
        this.currentSessionId = session.id;
        this.messages = [];
        this.statusMessage = 'New session ready.';
      },
      error: (error: unknown) => this.handleSessionError(error),
      complete: () => (this.sessionsLoading = false)
    });
  }

  selectSession(sessionId: string): void {
    if (this.currentSessionId === sessionId || this.sessionsLoading) return;

    this.stopVoiceConversation();
    this.sessionsLoading = true;

    this.chatbotService.getSession(sessionId).subscribe({
      next: (session) => this.applySession(session),
      error: (error: unknown) => this.handleSessionError(error),
      complete: () => (this.sessionsLoading = false)
    });
  }

  deleteCurrentSession(): void {
    if (!this.currentSessionId || this.sessionsLoading) return;

    this.stopVoiceConversation();
    const sessionId = this.currentSessionId;
    this.sessionsLoading = true;

    this.chatbotService.deleteSession(sessionId).subscribe({
      next: () => {
        this.sessions = this.sessions.filter((session) => session.id !== sessionId);
        this.currentSessionId = null;
        this.messages = [];
        this.statusMessage = 'Session deleted.';
      },
      error: (error: unknown) => this.handleSessionError(error),
      complete: () => (this.sessionsLoading = false)
    });
  }

  sendMessage(): void {
    const cleanQuestion = this.question.trim();

    if (!cleanQuestion || this.isBusy || this.recordingMode || this.voiceConversationActive) return;

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

  toggleDictation(): void {
    if (this.recordingMode === 'dictate') {
      this.stopRecording(true);
      return;
    }

    this.startRecording('dictate');
  }

  toggleVoiceChat(): void {
    if (this.voiceConversationActive || this.recordingMode === 'voice-chat' || this.voiceChatLoading || this.assistantSpeaking) {
      this.stopVoiceConversation();
      return;
    }

    this.startVoiceConversation();
  }

  stopVoiceConversation(): void {
    if (!this.voiceConversationActive && this.recordingMode !== 'voice-chat' && !this.voiceChatLoading && !this.assistantSpeaking) {
      return;
    }

    this.voiceConversationActive = false;
    this.voiceLoopId += 1;
    this.clearVoiceRestartTimer();
    this.stopAssistantAudio();
    this.loading = false;
    this.voiceChatLoading = false;

    if (this.recordingMode === 'voice-chat') {
      this.stopRecording(false);
    }

    this.statusMessage = '';
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
      : [];
  }

  private handleSessionError(error: unknown): void {
    console.error(error);
    this.statusMessage = 'Unable to load chat sessions.';
  }

  private startVoiceConversation(): void {
    if (this.isBusy || this.recordingMode) return;

    this.voiceConversationActive = true;
    this.voiceLoopId += 1;
    this.statusMessage = 'Mode vocal actif.';
    this.startRecording('voice-chat');
  }

  private async startRecording(mode: VoiceRecordingMode): Promise<void> {
    if (this.recordingMode) return;
    if (mode === 'dictate' && (this.isBusy || this.voiceConversationActive)) return;
    if (mode === 'voice-chat' && (this.loading || this.voiceChatLoading || this.dictationLoading)) return;

    const token = this.authService.getToken();

    if (!token) {
      if (mode === 'voice-chat') {
        this.voiceConversationActive = false;
      }

      this.messages.push({
        role: 'assistant',
        text: 'Vous devez vous connecter pour utiliser le chatbot ProFood.'
      });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      if (mode === 'voice-chat') {
        this.voiceConversationActive = false;
      }

      this.statusMessage = 'Voice recording is not supported in this browser.';
      return;
    }

    try {
      this.stopAssistantAudio();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      const mimeType = this.getSupportedAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      this.audioStream = stream;
      this.mediaRecorder = recorder;
      this.recordedChunks = [];
      this.recordingMode = mode;
      this.recordingStartedAt = performance.now();
      this.speechDetected = false;
      this.silenceStartedAt = null;
      this.shouldProcessRecording = true;
      this.statusMessage = mode === 'dictate'
        ? 'Dictee en cours...'
        : 'Je vous ecoute...';

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      recorder.onerror = () => {
        this.statusMessage = 'Recording failed. Please try again.';
        if (mode === 'voice-chat') {
          this.voiceConversationActive = false;
        }

        this.cleanupRecording();
      };

      recorder.onstop = () => {
        const chunks = [...this.recordedChunks];
        const recordingMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const shouldProcess = this.shouldProcessRecording;

        this.cleanupRecording();

        if (!shouldProcess) {
          if (mode === 'voice-chat' && this.voiceConversationActive) {
            this.scheduleNextVoiceListening(250);
          }

          return;
        }

        this.handleRecordedAudio(mode, chunks, recordingMimeType);
      };

      recorder.start();
      this.startSilenceDetection(stream);
    } catch (error) {
      console.error(error);
      if (mode === 'voice-chat') {
        this.voiceConversationActive = false;
      }

      this.cleanupRecording();
      this.statusMessage = 'Microphone permission was denied or unavailable.';
    }
  }

  private stopRecording(processAudio = true): void {
    const recorder = this.mediaRecorder;

    this.shouldProcessRecording = processAudio;
    this.statusMessage = processAudio ? 'Traitement audio...' : '';

    if (!processAudio) {
      this.recordingMode = null;
    }

    if (!recorder || recorder.state === 'inactive') {
      this.cleanupRecording();
      return;
    }

    this.stopSilenceDetection();
    recorder.stop();
    this.stopMicrophoneTracks();
  }

  private handleRecordedAudio(mode: VoiceRecordingMode, chunks: Blob[], mimeType: string): void {
    const token = this.authService.getToken();

    if (!token) {
      this.statusMessage = '';
      return;
    }

    if (!chunks.length) {
      this.statusMessage = 'No audio was captured.';
      return;
    }

    const audioBlob = new Blob(chunks, { type: mimeType });

    if (mode === 'dictate') {
      this.transcribeDictation(audioBlob, token);
      return;
    }

    if (!this.voiceConversationActive) return;

    this.askWithTranscribedVoice(audioBlob, token);
  }

  private transcribeDictation(audioBlob: Blob, token: string): void {
    this.dictationLoading = true;
    this.statusMessage = 'Transcribing voice input...';

    this.chatbotService.transcribeVoice(audioBlob, token).subscribe({
      next: (response: VoiceTranscribeResponse) => {
        this.question = response.transcript || '';
        this.statusMessage = response.transcript
          ? 'Transcript ready. Review it, then send when ready.'
          : 'No speech was detected.';
      },
      error: (error: unknown) => {
        console.error(error);
        this.statusMessage = 'Voice transcription failed.';
      },
      complete: () => {
        this.dictationLoading = false;
      }
    });
  }

  private askWithTranscribedVoice(audioBlob: Blob, token: string): void {
    const activeVoiceLoopId = this.voiceLoopId;

    this.loading = true;
    this.voiceChatLoading = true;
    this.statusMessage = 'Transcription de votre question...';

    this.chatbotService.transcribeVoice(audioBlob, token).subscribe({
      next: (response: VoiceTranscribeResponse) => {
        if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;

        const transcript = (response.transcript || '').trim();

        if (!transcript) {
          this.loading = false;
          this.voiceChatLoading = false;
          this.statusMessage = 'No speech was detected.';
          this.scheduleNextVoiceListening(350);
          return;
        }

        this.messages.push({
          role: 'user',
          text: transcript
        });

        this.askTextFromVoiceTranscript(transcript, activeVoiceLoopId);
      },
      error: (error: unknown) => {
        if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;

        console.error(error);
        this.loading = false;
        this.voiceChatLoading = false;
        this.voiceConversationActive = false;

        this.messages.push({
          role: 'assistant',
          text: 'Desole, la transcription vocale a echoue. Verifiez que FastAPI RAG est lance sur http://127.0.0.1:8000.'
        });
      }
    });
  }

  private askTextFromVoiceTranscript(transcript: string, activeVoiceLoopId: number): void {
    this.statusMessage = 'Preparation de la reponse...';

    this.chatbotService.ask(transcript, this.currentSessionId).subscribe({
      next: (response: AskResponse) => {
        if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;

        this.currentSessionId = response.session_id;

        this.messages.push({
          role: 'assistant',
          text: response.answer,
          sources: response.sources || []
        });

        this.loadSessions();
        this.loading = false;
        this.voiceChatLoading = false;
        this.statusMessage = 'Generation de la voix...';
        this.speakVoiceAnswer(response.answer, activeVoiceLoopId);
      },
      error: (error: unknown) => {
        if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;

        console.error(error);
        this.loading = false;
        this.voiceChatLoading = false;
        this.voiceConversationActive = false;

        this.messages.push({
          role: 'assistant',
          text: 'Desole, une erreur est survenue pendant le chat vocal. Verifiez que FastAPI RAG est lance sur http://127.0.0.1:8000.'
        });
      }
    });
  }

  private speakVoiceAnswer(answer: string, activeVoiceLoopId: number): void {
    if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;

    this.chatbotService.speakText(answer).subscribe({
      next: (response) => {
        if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;

        this.playAssistantAudio(response.audio_url, () => this.scheduleNextVoiceListening(350));
      },
      error: (error: unknown) => {
        if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;

        console.error(error);
        this.statusMessage = 'The text answer is ready, but voice generation failed.';
        this.scheduleNextVoiceListening(600);
      }
    });
  }

  private isActiveVoiceLoop(activeVoiceLoopId: number): boolean {
    return this.voiceConversationActive && activeVoiceLoopId === this.voiceLoopId;
  }

  private playAssistantAudio(audioUrl?: string | null, onDone?: () => void): void {
    const absoluteAudioUrl = this.chatbotService.getAbsoluteAudioUrl(audioUrl);

    if (!absoluteAudioUrl) {
      onDone?.();
      return;
    }

    const audio = new Audio(absoluteAudioUrl);
    this.assistantAudio = audio;
    this.assistantSpeaking = true;
    this.statusMessage = 'Reponse vocale...';

    audio.onended = () => {
      this.assistantSpeaking = false;
      this.assistantAudio = null;
      onDone?.();
    };

    audio.onerror = () => {
      this.assistantSpeaking = false;
      this.assistantAudio = null;
      onDone?.();
    };

    audio.play().catch((error: unknown) => {
      console.error(error);
      this.assistantSpeaking = false;
      this.assistantAudio = null;
      this.statusMessage = 'The voice answer is ready, but playback was blocked by the browser.';
      onDone?.();
    });
  }

  private stopSilenceDetection(): void {
    if (this.silenceFrameId !== null) {
      window.cancelAnimationFrame(this.silenceFrameId);
    }

    this.silenceFrameId = null;
  }

  private stopMicrophoneTracks(): void {
    this.audioStream?.getTracks().forEach((track) => track.stop());
  }

  private cleanupRecording(): void {
    this.stopSilenceDetection();
    this.stopMicrophoneTracks();
    void this.audioContext?.close();
    this.audioContext = null;
    this.audioSource = null;
    this.audioStream = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recordingMode = null;
    this.speechDetected = false;
    this.silenceStartedAt = null;
    this.recordingStartedAt = 0;
    this.shouldProcessRecording = true;
  }

  private stopAssistantAudio(): void {
    if (!this.assistantAudio) return;

    this.assistantAudio.onended = null;
    this.assistantAudio.onerror = null;
    this.assistantAudio.pause();
    this.assistantAudio.currentTime = 0;
    this.assistantAudio = null;
    this.assistantSpeaking = false;
  }

  private clearVoiceRestartTimer(): void {
    if (this.voiceRestartTimerId === null) return;

    window.clearTimeout(this.voiceRestartTimerId);
    this.voiceRestartTimerId = null;
  }

  private scheduleNextVoiceListening(delayMs: number): void {
    this.clearVoiceRestartTimer();

    if (!this.voiceConversationActive) return;

    this.statusMessage = 'Mode vocal actif.';
    this.voiceRestartTimerId = window.setTimeout(() => {
      this.voiceRestartTimerId = null;

      if (!this.voiceConversationActive || this.isBusy || this.recordingMode || this.assistantSpeaking) return;

      this.startRecording('voice-chat');
    }, delayMs);
  }

  private startSilenceDetection(stream: MediaStream): void {
    if (typeof window.AudioContext === 'undefined') return;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const samples = new Float32Array(analyser.fftSize);
    const maxRecordingMs = this.maxRecordingMs;

    analyser.fftSize = 2048;
    this.audioContext = audioContext;
    this.audioSource = audioContext.createMediaStreamSource(stream);
    this.audioSource.connect(analyser);

    const checkSilence = () => {
      if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') return;

      analyser.getFloatTimeDomainData(samples);

      let sum = 0;
      for (const sample of samples) {
        sum += sample * sample;
      }

      const rms = Math.sqrt(sum / samples.length);
      const now = performance.now();

      if (rms > this.silenceThreshold) {
        this.speechDetected = true;
        this.silenceStartedAt = null;
      } else if (this.speechDetected) {
        this.silenceStartedAt ??= now;

        if (now - this.silenceStartedAt >= this.silenceDelayMs) {
          this.stopRecording();
          return;
        }
      } else if (now - this.recordingStartedAt >= this.maxIdleRecordingMs) {
        this.stopRecording(false);
        return;
      }

      if (now - this.recordingStartedAt >= maxRecordingMs) {
        this.stopRecording(this.speechDetected);
        return;
      }

      this.silenceFrameId = window.requestAnimationFrame(checkSilence);
    };

    this.silenceFrameId = window.requestAnimationFrame(checkSilence);
  }

  private getSupportedAudioMimeType(): string {
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];

    return mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
  }
}
