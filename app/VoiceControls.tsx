"use client";

import { useEffect, useRef, useState } from "react";

const recordingFormats = ["audio/webm", "audio/mp4", "audio/ogg"];

type Recognition = {
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function recognitionConstructor() {
  const browser = window as Window & {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

export function VoiceControls({ text, label, language, onDictation, disabled }: {
  text: string;
  label: string;
  language: string;
  onDictation?: (text: string) => void;
  disabled?: boolean;
}) {
  const [available, setAvailable] = useState({ recognition: false, recording: false, speech: false });
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState<"starting" | "recording" | "transcribing" | null>(null);
  const [preferRecording, setPreferRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState("");
  const recognition = useRef<Recognition>(null);
  const audio = useRef<{ cancel: () => void; stop: () => void }>(null);
  const utterance = useRef<SpeechSynthesisUtterance>(null);
  const locale = language === "Hindi" ? "hi-IN" : language === "Hinglish" ? "en-IN" : "en-US";

  useEffect(() => {
    setAvailable({
      recognition: Boolean(recognitionConstructor()),
      recording: typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined",
      speech: "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
    });
    return () => {
      audio.current?.cancel();
      const active = recognition.current;
      if (active) {
        active.onresult = active.onerror = active.onend = null;
        active.abort();
        recognition.current = null;
      }
      const spoken = utterance.current;
      if (spoken) {
        spoken.onend = spoken.onerror = null;
        window.speechSynthesis.cancel();
        utterance.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (disabled && audio.current) {
      audio.current.cancel();
      setRecording(null);
      setNotice("");
    }
    const active = recognition.current;
    if (disabled && active) {
      active.onresult = active.onerror = active.onend = null;
      recognition.current = null;
      active.abort();
      setListening(false);
      setNotice("");
    }
  }, [disabled]);

  function dictate() {
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    const SpeechRecognition = recognitionConstructor();
    if (!onDictation) return;
    if (audio.current) {
      audio.current.stop();
      return;
    }
    if ((!SpeechRecognition || preferRecording) && available.recording) {
      void record(onDictation);
      return;
    }
    if (!SpeechRecognition) {
      setNotice("Microphone access is unavailable here. Open this page in a browser tab on localhost or HTTPS.");
      return;
    }
    const active = new SpeechRecognition();
    active.lang = locale;
    let failed = false;
    active.onresult = event => {
      const transcript = Array.from(event.results, row => row[0]?.transcript ?? "").join(" ").trim();
      if (transcript) onDictation(transcript);
    };
    active.onerror = event => {
      failed = true;
      if (event.error === "not-allowed") {
        setNotice("Microphone access was denied. Allow it in your browser and try again.");
      } else if (available.recording) {
        setPreferRecording(true);
        setNotice("Browser dictation failed. You can try recording with Sarvam.");
      } else {
        setNotice("Could not transcribe audio.");
      }
    };
    active.onend = () => {
      recognition.current = null;
      setListening(false);
      if (!failed) setNotice("");
    };
    try {
      recognition.current = active;
      active.start();
      setListening(true);
      setNotice("Listening with your browser’s speech service.");
    } catch {
      recognition.current = null;
      if (available.recording) setPreferRecording(true);
      setNotice(available.recording ? "Browser dictation could not start. Try recording with Sarvam." : "Could not start microphone dictation.");
    }
  }

  async function record(insert: (text: string) => void) {
    const mime = recordingFormats.find(format => MediaRecorder.isTypeSupported(format));
    if (!mime) {
      setNotice("This browser does not support a recording format SkillForge can transcribe.");
      return;
    }
    const controller = new AbortController();
    let stream: MediaStream | undefined;
    let recorder: MediaRecorder | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      clearTimeout(timeout);
      stream?.getTracks().forEach(track => track.stop());
    };
    const stop = () => { if (recorder?.state === "recording") recorder.stop(); };
    const cancel = () => {
      controller.abort();
      stop();
      release();
      audio.current = null;
    };
    audio.current = { stop, cancel };
    setRecording("starting");
    setNotice("Waiting for microphone access.");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (controller.signal.aborted) { release(); return; }
      recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        cancel();
        setRecording(null);
        setNotice("Could not record audio. Check your microphone and try again.");
      };
      recorder.onstop = async () => {
        release();
        if (controller.signal.aborted) return;
        setRecording("transcribing");
        setNotice("Transcribing with Sarvam.");
        try {
          const response = await fetch("/api/transcribe?language=" + encodeURIComponent(language), {
            method: "POST", body: new Blob(chunks, { type: mime }), signal: controller.signal,
          });
          const result = await response.json();
          if (controller.signal.aborted) return;
          if (!response.ok) throw new Error(result.error || "Could not transcribe the recording.");
          insert(result.transcript);
          setNotice("");
        } catch (error) {
          if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "Could not transcribe the recording.");
        } finally {
          if (!controller.signal.aborted) { audio.current = null; setRecording(null); }
        }
      };
      recorder.start();
      timeout = setTimeout(stop, 20000);
      setRecording("recording");
      setNotice("Recording. Select Stop dictation to insert your speech as text.");
    } catch (error) {
      release();
      if (controller.signal.aborted) return;
      audio.current = null;
      setRecording(null);
      setNotice(error instanceof DOMException && error.name === "NotAllowedError"
        ? "Microphone access was denied. Allow it in your browser and try again."
        : "Could not open the microphone. Check that it is connected and available.");
    }
  }

  function speak() {
    const service = window.speechSynthesis;
    service.cancel();
    if (speaking) {
      utterance.current = null;
      setSpeaking(false);
      setNotice("");
      return;
    }
    const spoken = new SpeechSynthesisUtterance(text);
    spoken.lang = locale;
    const localVoice = service.getVoices().find(voice => voice.localService && voice.lang.toLowerCase() === locale.toLowerCase());
    if (localVoice) spoken.voice = localVoice;
    const finish = (message: string) => {
      if (utterance.current !== spoken) return;
      utterance.current = null;
      setSpeaking(false);
      setNotice(message);
    };
    spoken.onend = () => finish("");
    spoken.onerror = event => finish(["canceled", "interrupted"].includes(event.error) ? "" : "Could not read this text aloud.");
    utterance.current = spoken;
    setSpeaking(true);
    setNotice("");
    service.speak(spoken);
  }

  if (!available.speech && !onDictation) return null;
  const cloudRecording = available.recording && (!available.recognition || preferRecording);
  return <div className="voice-controls">
    {onDictation && <button type="button" className="dictation-button" disabled={disabled || speaking || recording === "starting" || recording === "transcribing"} onClick={dictate}>
      <span aria-hidden="true">🎙 </span>{listening || recording === "recording" ? "Stop dictation" : "Dictate " + label}
    </button>}
    {available.speech && <button type="button" disabled={disabled || listening || Boolean(recording) || !text.trim()} onClick={speak}>
      {speaking ? "Stop reading" : "Read " + label + " aloud"}
    </button>}
    {notice && <small role="status">{notice}</small>}
    {onDictation && cloudRecording && !recording && <small>Recorded audio is sent to Sarvam for transcription.</small>}
  </div>;
}
