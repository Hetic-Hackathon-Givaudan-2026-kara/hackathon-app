interface SpeechAlternativeLike {
  transcript: string;
}

interface SpeechResultLike {
  length: number;
  [index: number]: SpeechAlternativeLike;
}

interface SpeechResultsLike {
  length: number;
  [index: number]: SpeechResultLike;
}

interface SpeechResultEventLike extends Event {
  results: SpeechResultsLike;
}

interface SpeechErrorEventLike extends Event {
  error: string;
}

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

interface SpeechWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

interface SpeechCallbacks {
  onTranscript: (transcript: string) => void;
  onListeningChange: (listening: boolean) => void;
  onError: (message: string) => void;
}

export class SpeechInput {
  private recognition: BrowserSpeechRecognition | null = null;

  constructor(private readonly callbacks: SpeechCallbacks) {}

  get isListening(): boolean {
    return this.recognition !== null;
  }

  start(): boolean {
    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      this.callbacks.onError(
        'La dictée vocale n’est pas disponible dans ce navigateur.',
      );
      return false;
    }

    if (this.recognition) return true;

    const recognition = new Recognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(
        { length: event.results.length },
        (_, index) => event.results[index][0]?.transcript ?? '',
      )
        .join(' ')
        .trim();
      if (transcript) this.callbacks.onTranscript(transcript);
    };
    recognition.onerror = (event) => {
      this.callbacks.onError(
        event.error === 'not-allowed'
          ? 'Autorisez l’accès au microphone pour dicter votre demande.'
          : `La dictée vocale a échoué (${event.error}).`,
      );
    };
    recognition.onend = () => {
      this.recognition = null;
      this.callbacks.onListeningChange(false);
    };

    try {
      recognition.start();
      this.recognition = recognition;
      this.callbacks.onListeningChange(true);
      return true;
    } catch (error) {
      this.callbacks.onError(
        error instanceof Error
          ? error.message
          : 'Impossible de démarrer la dictée vocale.',
      );
      return false;
    }
  }

  stop(): void {
    this.recognition?.stop();
  }
}
