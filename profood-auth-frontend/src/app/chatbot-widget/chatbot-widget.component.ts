import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../auth.service';
import {
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
  specialist?: string | null;
  imagePreview?: string;
  imageDescription?: string;
  showImageDescription?: boolean;
}

interface ChatSpecialist {
  id: string;
  name: string;
  shortName: string;
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
  selectedImageFile: File | null = null;
  selectedImagePreview: string | null = null;
  statusMessage = '';
  recordingMode: VoiceRecordingMode | null = null;
  voiceConversationActive = false;
  assistantSpeaking = false;

  currentSessionId: string | null = null;
  sessions: ChatSessionSummary[] = [];
  messages: ChatMessage[] = [];
  selectedSpecialist = 'general';
  readonly specialists: ChatSpecialist[] = [
    { id: 'general', name: 'Assistant Général ProFood', shortName: 'Général' },
    { id: 'food', name: 'Produits Alimentaires', shortName: 'Food' },
    { id: 'equipment', name: 'Équipements Professionnels', shortName: 'Équipements' },
    { id: 'supplier', name: 'Fournisseurs', shortName: 'Fournisseurs' },
    { id: 'services', name: 'Services', shortName: 'Services' },
    { id: 'taxonomy', name: 'Catégories et Taxonomies', shortName: 'Taxonomies' }
  ];
  private readonly allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
  private readonly maxImageBytes = 5 * 1024 * 1024;
  private readonly silenceThreshold = 0.04;
  private readonly silenceDelayMs = 550;
  private readonly maxIdleRecordingMs = 2500;
  private readonly maxRecordingMs = 10000;
  private audioStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private assistantAudio: HTMLAudioElement | null = null;
  private streamAbortController: AbortController | null = null;
  private textStreamAbortController: AbortController | null = null;
  private voiceRestartTimerId: number | null = null;
  private silenceFrameId: number | null = null;
  private speechDetected = false;
  private silenceStartedAt: number | null = null;
  private recordingStartedAt = 0;
  private shouldProcessRecording = true;
  private voiceLoopId = 0;
  private recordedChunks: Blob[] = [];
  private audioQueue: string[] = [];
  private pendingSpeechText = '';
  private pendingTtsRequests = 0;
  private voiceStreamCompleted = false;

  constructor(
    private readonly authService: AuthService,
    private readonly chatbotService: ChatbotService,
    private readonly changeDetector: ChangeDetectorRef
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

  get selectedSpecialistName(): string {
    return this.getSpecialistLabel(this.selectedSpecialist);
  }

  getSpecialistLabel(specialistId?: string | null): string {
    return this.specialists.find((specialist) => specialist.id === specialistId)?.shortName || 'Général';
  }

  choosePrompt(prompt: string, specialist: string): void {
    this.selectedSpecialist = specialist;
    this.question = prompt;
  }

  toggleChat(): void {
    this.isOpen = !this.isOpen;

    if (!this.isOpen) {
      this.abortTextStream();
      this.stopVoiceConversation();
      this.clearSelectedImage();

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

    this.abortTextStream();
    this.stopVoiceConversation();
    this.clearSelectedImage();
    this.sessionsLoading = true;

    this.chatbotService.createSession('New chat', this.selectedSpecialist).subscribe({
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

    this.abortTextStream();
    this.stopVoiceConversation();
    this.clearSelectedImage();
    this.sessionsLoading = true;

    this.chatbotService.getSession(sessionId).subscribe({
      next: (session) => this.applySession(session),
      error: (error: unknown) => this.handleSessionError(error),
      complete: () => (this.sessionsLoading = false)
    });
  }

  deleteCurrentSession(): void {
    if (!this.currentSessionId || this.sessionsLoading) return;

    this.abortTextStream();
    this.stopVoiceConversation();
    this.clearSelectedImage();
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

  submitChat(): void {
    if (this.selectedImageFile) {
      this.sendImageMessage();
      return;
    }

    this.sendMessage();
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const imageFile = input.files?.[0] || null;

    input.value = '';

    if (!imageFile) return;

    if (!this.allowedImageTypes.has(imageFile.type)) {
      this.statusMessage = 'Formats acceptes: PNG, JPG, JPEG ou WEBP.';
      this.clearSelectedImage();
      return;
    }

    if (imageFile.size > this.maxImageBytes) {
      this.statusMessage = 'Image trop grande. Taille maximale: 5MB.';
      this.clearSelectedImage();
      return;
    }

    this.clearSelectedImage();
    this.selectedImageFile = imageFile;
    this.selectedImagePreview = URL.createObjectURL(imageFile);
    this.statusMessage = '';
    this.changeDetector.detectChanges();
  }

  clearSelectedImage(revokePreview = true): void {
    if (revokePreview && this.selectedImagePreview) {
      URL.revokeObjectURL(this.selectedImagePreview);
    }

    this.selectedImageFile = null;
    this.selectedImagePreview = null;
    this.changeDetector.detectChanges();
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
      text: cleanQuestion,
      specialist: this.selectedSpecialist
    });

    this.question = '';
    this.loading = true;
    this.statusMessage = '';

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      text: '',
      sources: [],
      specialist: this.selectedSpecialist
    };
    const abortController = new AbortController();

    this.messages.push(assistantMessage);
    this.textStreamAbortController = abortController;

    void this.chatbotService.streamAsk(
      {
        question: cleanQuestion,
        k: 4,
        filters: null,
        session_id: this.currentSessionId,
        specialist: this.selectedSpecialist,
        voice_mode: false
      },
      {
        session: (sessionId) => {
          this.currentSessionId = sessionId;
          this.refreshStreamingView();
        },
        chunk: (text) => {
          if (!text) return;

          assistantMessage.text += text;
          this.refreshStreamingView();
        },
        sources: (sources) => {
          assistantMessage.sources = sources || [];
          this.refreshStreamingView();
        },
        done: (sessionId) => {
          if (sessionId) {
            this.currentSessionId = sessionId;
          }

          this.loading = false;
          this.loadSessions();
          this.refreshStreamingView();
        }
      },
      abortController.signal
    )
      .catch((error: unknown) => {
        if (this.isAbortError(error)) return;

        console.error(error);

        assistantMessage.text = assistantMessage.text ||
          'Desole, une erreur est survenue. Verifiez que FastAPI RAG est lance sur http://127.0.0.1:8000.';
        this.loading = false;
        this.refreshStreamingView();
      })
      .finally(() => {
        if (this.textStreamAbortController === abortController) {
          this.textStreamAbortController = null;
        }
      });
  }

  sendImageMessage(): void {
    const imageFile = this.selectedImageFile;

    if (!imageFile) {
      this.sendMessage();
      return;
    }

    if (this.isBusy || this.recordingMode || this.voiceConversationActive) return;

    if (!this.allowedImageTypes.has(imageFile.type) || imageFile.size > this.maxImageBytes) {
      this.statusMessage = 'Image invalide. Utilisez PNG, JPG, JPEG ou WEBP jusqu a 5MB.';
      return;
    }

    if (!this.authService.getToken()) {
      this.messages.push({
        role: 'assistant',
        text: 'Vous devez vous connecter pour utiliser le chatbot ProFood.'
      });

      return;
    }

    const cleanQuestion = this.question.trim() || 'Analyse cette image dans le contexte de ProFood.';
    const previewUrl = this.selectedImagePreview || undefined;

    this.messages.push({
      role: 'user',
      text: cleanQuestion,
      specialist: this.selectedSpecialist,
      imagePreview: previewUrl
    });

    this.question = '';
    this.selectedImageFile = null;
    this.selectedImagePreview = null;
    this.loading = true;
    this.statusMessage = 'Analyse de l image...';

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      text: '',
      sources: [],
      specialist: this.selectedSpecialist,
      showImageDescription: false
    };

    this.messages.push(assistantMessage);
    this.refreshStreamingView();

    this.chatbotService.askImage(imageFile, cleanQuestion, this.currentSessionId, this.selectedSpecialist).subscribe({
      next: (response) => {
        if (response.session_id) {
          this.currentSessionId = response.session_id;
        }

        assistantMessage.text = response.answer;
        assistantMessage.sources = response.sources || [];
        assistantMessage.imageDescription = response.image_description;
        this.statusMessage = '';
        this.refreshStreamingView();
      },
      error: (error: unknown) => {
        console.error(error);
        assistantMessage.text =
          'Desole, l analyse de l image a echoue. Verifiez que FastAPI est lance et que llava:7b est installe dans Ollama.';
        this.loading = false;
        this.statusMessage = '';
        this.refreshStreamingView();
      },
      complete: () => {
        this.loading = false;
        this.loadSessions();
        this.refreshStreamingView();
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
    this.abortCurrentStream();
    this.clearVoiceRestartTimer();
    this.clearAssistantAudioQueue();
    this.loading = false;
    this.voiceChatLoading = false;

    if (this.recordingMode === 'voice-chat') {
      this.stopRecording(false);
    }

    this.statusMessage = '';
    this.refreshStreamingView();
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
    this.selectedSpecialist = session.specialist || this.selectedSpecialist;

    this.messages = session.messages.length
      ? session.messages.map((message) => ({
          role: message.role,
          text: message.content,
          sources: message.sources || [],
          specialist: message.specialist || session.specialist || null
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
      this.refreshStreamingView();

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
        this.refreshStreamingView();
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
        this.refreshStreamingView();
      };

      recorder.start(250);
      this.startSilenceDetection(stream);
    } catch (error) {
      console.error(error);
      if (mode === 'voice-chat') {
        this.voiceConversationActive = false;
      }

      this.cleanupRecording();
      this.statusMessage = 'Microphone permission was denied or unavailable.';
      this.refreshStreamingView();
    }
  }

  private stopRecording(processAudio = true): void {
    const recorder = this.mediaRecorder;

    this.shouldProcessRecording = processAudio;
    this.statusMessage = processAudio ? 'Traitement audio...' : '';
    this.recordingMode = null;
    this.refreshStreamingView();

    if (!recorder || recorder.state === 'inactive') {
      this.cleanupRecording();
      this.refreshStreamingView();
      return;
    }

    this.stopSilenceDetection();
    this.flushRecorderData(recorder);
    recorder.stop();
    this.stopMicrophoneTracks();
  }

  private flushRecorderData(recorder: MediaRecorder): void {
    if (recorder.state !== 'recording') return;

    try {
      recorder.requestData();
    } catch (error) {
      console.warn('Unable to flush recorder data before stopping.', error);
    }
  }

  private handleRecordedAudio(mode: VoiceRecordingMode, chunks: Blob[], mimeType: string): void {
    const token = this.authService.getToken();

    if (!token) {
      this.statusMessage = '';
      this.refreshStreamingView();
      return;
    }

    if (!chunks.length) {
      this.statusMessage = 'No audio was captured.';
      this.refreshStreamingView();
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
    this.refreshStreamingView();

    this.chatbotService.transcribeVoice(audioBlob, token).subscribe({
      next: (response: VoiceTranscribeResponse) => {
        this.question = response.transcript || '';
        this.statusMessage = response.transcript
          ? 'Transcript ready. Review it, then send when ready.'
          : 'No speech was detected.';
        this.refreshStreamingView();
      },
      error: (error: unknown) => {
        console.error(error);
        this.statusMessage = 'Voice transcription failed.';
        this.refreshStreamingView();
      },
      complete: () => {
        this.dictationLoading = false;
        this.refreshStreamingView();
      }
    });
  }

  private askWithTranscribedVoice(audioBlob: Blob, token: string): void {
    const activeVoiceLoopId = this.voiceLoopId;

    this.loading = true;
    this.voiceChatLoading = true;
    this.statusMessage = 'Transcription de votre question...';
    this.refreshStreamingView();

    this.chatbotService.transcribeVoice(audioBlob, token).subscribe({
      next: (response: VoiceTranscribeResponse) => {
        if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;

        const transcript = (response.transcript || '').trim();

        if (!transcript) {
          this.loading = false;
          this.voiceChatLoading = false;
          this.statusMessage = 'No speech was detected.';
          this.scheduleNextVoiceListening(350);
          this.refreshStreamingView();
          return;
        }

        this.messages.push({
          role: 'user',
          text: transcript,
          specialist: this.selectedSpecialist
        });
        this.refreshStreamingView();

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
        this.refreshStreamingView();
      }
    });
  }

  private askTextFromVoiceTranscript(transcript: string, activeVoiceLoopId: number): void {
    this.statusMessage = 'Preparation de la reponse...';
    this.pendingSpeechText = '';
    this.pendingTtsRequests = 0;
    this.audioQueue = [];
    this.voiceStreamCompleted = false;

    const assistantMessage: ChatMessage = {
      role: 'assistant',
      text: '',
      sources: [],
      specialist: this.selectedSpecialist
    };

    this.messages.push(assistantMessage);

    const abortController = new AbortController();
    this.streamAbortController = abortController;

    void this.chatbotService.streamAsk(
      {
        question: transcript,
        k: 4,
        filters: null,
        session_id: this.currentSessionId,
        specialist: this.selectedSpecialist,
        voice_mode: true
      },
      {
        session: (sessionId) => {
          if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;
          this.currentSessionId = sessionId;
          this.refreshStreamingView();
        },
        chunk: (text) => {
          if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;
          if (!text) return;

          assistantMessage.text += text;
          this.pendingSpeechText += text;
          this.queueCompletedSentences(false, activeVoiceLoopId);
          this.statusMessage = 'Reponse en cours...';
          this.refreshStreamingView();
        },
        sources: (sources) => {
          if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;
          assistantMessage.sources = sources || [];
          this.refreshStreamingView();
        },
        done: (sessionId) => {
          if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;

          if (sessionId) {
            this.currentSessionId = sessionId;
          }

          this.voiceStreamCompleted = true;
          this.queueCompletedSentences(true, activeVoiceLoopId);
          this.loadSessions();
          this.loading = false;
          this.voiceChatLoading = false;
          this.statusMessage = this.hasPendingVoiceAudio()
            ? 'Generation de la voix...'
            : 'Mode vocal actif.';
          this.maybeFinishVoicePlayback(activeVoiceLoopId);
          this.refreshStreamingView();
        }
      },
      abortController.signal
    )
      .catch((error: unknown) => {
        if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;

        if (this.isAbortError(error)) return;

        console.error(error);
        this.loading = false;
        this.voiceChatLoading = false;
        this.voiceConversationActive = false;
        this.clearAssistantAudioQueue();

        assistantMessage.text = assistantMessage.text ||
          'Desole, une erreur est survenue pendant le chat vocal. Verifiez que FastAPI RAG est lance sur http://127.0.0.1:8000.';
        this.refreshStreamingView();
      })
      .finally(() => {
        if (this.streamAbortController === abortController) {
          this.streamAbortController = null;
        }
      });
  }

  private queueCompletedSentences(force: boolean, activeVoiceLoopId: number): void {
    const sentences = this.drainCompletedSentences(force);

    for (const sentence of sentences) {
      this.requestSentenceAudio(sentence, activeVoiceLoopId);
    }
  }

  private drainCompletedSentences(force: boolean): string[] {
    const sentences: string[] = [];
    let text = this.pendingSpeechText;
    const sentencePattern = /^([\s\S]*?[.!?])(\s+|$)/;
    let match = sentencePattern.exec(text);

    while (match) {
      const sentence = match[1].trim();

      if (sentence) {
        sentences.push(sentence);
      }

      text = text.slice(match[0].length);
      match = sentencePattern.exec(text);
    }

    if (force && text.trim()) {
      sentences.push(text.trim());
      text = '';
    }

    this.pendingSpeechText = text;

    return sentences;
  }

  private requestSentenceAudio(sentence: string, activeVoiceLoopId: number): void {
    if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;

    const text = sentence.trim();

    if (!text) return;

    this.pendingTtsRequests += 1;

    this.chatbotService.speakText(text).subscribe({
      next: (response) => {
        if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;

        const absoluteAudioUrl = this.chatbotService.getAbsoluteAudioUrl(response.audio_url);

        if (absoluteAudioUrl) {
          this.audioQueue.push(absoluteAudioUrl);
          this.playNextAssistantAudio(activeVoiceLoopId);
        }
      },
      error: (error: unknown) => {
        if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;

        console.error(error);
        this.statusMessage = 'The text answer is ready, but voice generation failed.';
      },
      complete: () => {
        this.pendingTtsRequests = Math.max(0, this.pendingTtsRequests - 1);
        this.maybeFinishVoicePlayback(activeVoiceLoopId);
      }
    });
  }

  private isActiveVoiceLoop(activeVoiceLoopId: number): boolean {
    return this.voiceConversationActive && activeVoiceLoopId === this.voiceLoopId;
  }

  private refreshStreamingView(): void {
    this.changeDetector.detectChanges();
  }

  private playNextAssistantAudio(activeVoiceLoopId: number): void {
    if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;
    if (this.assistantSpeaking || this.assistantAudio) return;

    const audioUrl = this.audioQueue.shift();

    if (!audioUrl) {
      this.maybeFinishVoicePlayback(activeVoiceLoopId);
      return;
    }

    const audio = new Audio(audioUrl);
    this.assistantAudio = audio;
    this.assistantSpeaking = true;
    this.statusMessage = 'Reponse vocale...';

    audio.onended = () => {
      this.assistantSpeaking = false;
      this.assistantAudio = null;
      this.playNextAssistantAudio(activeVoiceLoopId);
      this.maybeFinishVoicePlayback(activeVoiceLoopId);
    };

    audio.onerror = () => {
      this.assistantSpeaking = false;
      this.assistantAudio = null;
      this.playNextAssistantAudio(activeVoiceLoopId);
      this.maybeFinishVoicePlayback(activeVoiceLoopId);
    };

    audio.play().catch((error: unknown) => {
      console.error(error);
      this.assistantSpeaking = false;
      this.assistantAudio = null;
      this.statusMessage = 'The voice answer is ready, but playback was blocked by the browser.';
      this.playNextAssistantAudio(activeVoiceLoopId);
      this.maybeFinishVoicePlayback(activeVoiceLoopId);
    });
  }

  private maybeFinishVoicePlayback(activeVoiceLoopId: number): void {
    if (!this.isActiveVoiceLoop(activeVoiceLoopId)) return;

    if (!this.hasPendingVoiceAudio()) {
      this.statusMessage = 'Mode vocal actif.';
      this.scheduleNextVoiceListening(350);
    }
  }

  private hasPendingVoiceAudio(): boolean {
    return (
      !this.voiceStreamCompleted ||
      this.pendingTtsRequests > 0 ||
      this.assistantSpeaking ||
      Boolean(this.assistantAudio) ||
      this.audioQueue.length > 0
    );
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
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
    if (!this.assistantAudio) {
      this.assistantSpeaking = false;
      return;
    }

    this.assistantAudio.onended = null;
    this.assistantAudio.onerror = null;
    this.assistantAudio.pause();
    this.assistantAudio.currentTime = 0;
    this.assistantAudio = null;
    this.assistantSpeaking = false;
  }

  private abortCurrentStream(): void {
    if (!this.streamAbortController) return;

    this.streamAbortController.abort();
    this.streamAbortController = null;
  }

  private abortTextStream(): void {
    if (!this.textStreamAbortController) return;

    this.textStreamAbortController.abort();
    this.textStreamAbortController = null;
    this.loading = false;
    this.refreshStreamingView();
  }

  private clearAssistantAudioQueue(): void {
    this.audioQueue = [];
    this.pendingSpeechText = '';
    this.pendingTtsRequests = 0;
    this.voiceStreamCompleted = false;
    this.stopAssistantAudio();
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
