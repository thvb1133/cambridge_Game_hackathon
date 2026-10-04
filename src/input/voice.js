// Speech in, speech out. Both sides use the built-in browser APIs so there is
// no key to leak and no latency budget spent on a round trip; the recognised
// transcript goes through exactly the same compiler as typed text.

export class VoiceInput {
  constructor({ onTranscript = () => {}, onStatus = () => {} } = {}) {
    this.onTranscript = onTranscript;
    this.onStatus = onStatus;
    this.recognition = null;
    this.listening = false;
  }

  get supported() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  start() {
    if (!this.supported) {
      this.onStatus('voice unsupported in this browser — use the console');
      return false;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = 'en-GB';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const transcript = result[0].transcript.trim();
        if (transcript) this.onTranscript(transcript);
      }
    };
    recognition.onerror = (event) => this.onStatus(`voice error: ${event.error}`);
    // Chrome stops the stream on its own every ~60s; restart while enabled.
    recognition.onend = () => {
      if (this.listening) recognition.start();
    };

    recognition.start();
    this.recognition = recognition;
    this.listening = true;
    this.onStatus('listening · say "throw fire at the nearest one"');
    return true;
  }

  stop() {
    this.listening = false;
    this.recognition?.stop();
    this.onStatus('voice off');
  }

  toggle() {
    return this.listening ? (this.stop(), false) : this.start();
  }
}

export function speak(text, { rate = 1.05, pitch = 0.8 } = {}) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.pitch = pitch;
  utterance.volume = 0.9;
  window.speechSynthesis.speak(utterance);
}
