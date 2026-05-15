/**
 * Voice recording hook — manages Web Speech API and MediaRecorder fallback,
 * voice endpoint health, transcript processing, and extraction state.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ExtractedOrder, SpeechRecognitionAny } from "./types";
import {
  hasSpeechRecognition,
  getSpeechRecognition,
  normalizeVoiceParseResponse,
  isSpanishLowConfidence,
  mapBagSize,
  speak,
} from "./types";

export type Step = "record" | "processing" | "confirm";

export function useVoiceRecording(open: boolean, onClose: () => void) {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("record");
  const [lang, setLang] = useState<"en" | "es">("en");
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [extracted, setExtracted] = useState<ExtractedOrder | null>(null);
  const [processingLabel, setProcessingLabel] = useState("");

  // Editable confirmation fields
  const [editBagSize, setEditBagSize] = useState<string>("");
  const [editServiceType, setEditServiceType] = useState<string>("");
  const [editDeliverySpeed, setEditDeliverySpeed] = useState<string>("");
  const [editPickupAddress, setEditPickupAddress] = useState<string>("");
  const [editPickupDate, setEditPickupDate] = useState<string>("");
  const [editPickupWindow, setEditPickupWindow] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");

  // Spanish low-confidence warning
  const [showSpanishBeta, setShowSpanishBeta] = useState(false);

  // Voice endpoint health state
  const [voiceAvailable, setVoiceAvailable] = useState<boolean | null>(null); // null = checking

  // Web Speech API mode detection
  const useWebSpeech = hasSpeechRecognition();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionAny | null>(null);

  // Reset on open and check voice endpoint health
  useEffect(() => {
    if (open) {
      setStep("record");
      setIsRecording(false);
      setTranscript("");
      setInterimTranscript("");
      setExtracted(null);
      setShowSpanishBeta(false);
      chunksRef.current = [];
      // P1-11: Health check is advisory only — if it fails, leave mic enabled
      setVoiceAvailable(null);
      apiRequest("/api/voice/health")
        .then((r) => r.json())
        .then((data) => setVoiceAvailable(!!data.available))
        .catch(() => {
          // Advisory: don't block recording on health failure
          setVoiceAvailable(true);
        });
    }
    return () => {
      // Cleanup speech recognition on close
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.abort();
        speechRecognitionRef.current = null;
      }
    };
  }, [open]);

  const stopRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    // Stop Web Speech API recognition
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
    }
    // Stop MediaRecorder fallback
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  /** Populate editable fields from extracted data */
  function populateEditFields(extractedData: ExtractedOrder) {
    setEditBagSize(extractedData.bagSize || "");
    setEditServiceType(extractedData.serviceType || "");
    setEditDeliverySpeed(extractedData.deliverySpeed || "");
    setEditPickupAddress(extractedData.pickupAddress || "");
    setEditPickupDate(extractedData.pickupWindow?.date || "");
    setEditPickupWindow(
      extractedData.pickupWindow
        ? [extractedData.pickupWindow.timeStart, extractedData.pickupWindow.timeEnd]
            .filter(Boolean)
            .join(" – ")
        : "",
    );
    setEditNotes(extractedData.special_instructions || extractedData.preferences?.notes || "");
  }

  /** Process a completed transcript (from Web Speech API) via server-side extraction */
  async function processTranscript(text: string) {
    setStep("processing");
    setProcessingLabel("Extracting order details…");
    setInterimTranscript("");

    try {
      const parseRes = await apiRequest("POST", "/api/voice/parse", {
        transcription: text,
        language: lang,
      });

      const parseData = await parseRes.json();
      const detectedLang = parseData.language === "es" ? "es" : lang;
      const extractedData = normalizeVoiceParseResponse(parseData, detectedLang as "en" | "es");

      if (lang === "es" && isSpanishLowConfidence(extractedData, detectedLang as "en" | "es")) {
        setShowSpanishBeta(true);
      }

      populateEditFields(extractedData);
      setExtracted(extractedData);
      setStep("confirm");

      // Verbal confirmation via SpeechSynthesis
      const bagLabel = extractedData.bagSize || "a";
      const svc = extractedData.serviceType as string | null;
      const serviceLabel = svc === "wash_fold" ? "standard wash"
        : svc === "wash_fold_signature" ? "signature wash"
        : "wash";
      const confirmMsg = lang === "es"
        ? `Entendido. Una bolsa ${bagLabel}, ${serviceLabel}. Por favor confirma los detalles.`
        : `Got it. One ${bagLabel} bag, ${serviceLabel}. Please confirm the details.`;
      speak(confirmMsg, lang);
    } catch (err: any) {
      console.error("[VoiceOrder] processTranscript", err);
      toast({
        title: "Voice processing failed",
        description: err?.message || "Try again or enter your order manually.",
        variant: "destructive",
      });
      setStep("record");
    }
  }

  async function processAudio(blob: Blob) {
    setStep("processing");
    setProcessingLabel("Transcribing your voice…");

    const formData = new FormData();
    const ext = blob.type.includes("mp4") ? "mp4"
      : blob.type.includes("ogg") ? "ogg"
      : blob.type.includes("webm") ? "webm"
      : "webm";
    formData.append("audio", blob, `voice.${ext}`);
    formData.append("language", lang);

    try {
      let detectedLang: "en" | "es" = lang;

      // P0-10: Use apiRequest with FormData (auto-detects and skips JSON Content-Type)
      let transcribeRes: Response;
      try {
        transcribeRes = await apiRequest("/api/voice/transcribe", {
          method: "POST",
          body: formData,
        });
      } catch (err: any) {
        if (err.message?.includes("429")) {
          toast({ title: "Too many requests", description: "Wait a moment and try again.", variant: "destructive" });
          setStep("record");
          return;
        }
        throw err;
      }

      const transcribeData = await transcribeRes.json();

      if (transcribeData.warning === "language_unsupported") {
        toast({
          title: "Language not supported",
          description: "Please speak in English or Spanish.",
          variant: "destructive",
        });
        setStep("record");
        return;
      }

      const text = transcribeData.text || "";
      detectedLang = transcribeData.language === "es" ? "es" : "en";
      setTranscript(text);

      // P1-10: Guard empty transcription
      if (!text.trim()) {
        toast({ title: "We didn't catch that — try again", variant: "destructive" });
        setStep("record");
        return;
      }

      setProcessingLabel("Extracting order details…");

      // P0-10: Use apiRequest for parse endpoint
      const parseRes = await apiRequest("POST", "/api/voice/parse", {
        transcription: text,
        language: detectedLang,
      });

      const parseData = await parseRes.json();
      detectedLang = parseData.language === "es" ? "es" : detectedLang;
      const extractedData = normalizeVoiceParseResponse(parseData, detectedLang);

      // Check Spanish low-confidence
      if (lang === "es" && isSpanishLowConfidence(extractedData, detectedLang)) {
        setShowSpanishBeta(true);
      }

      populateEditFields(extractedData);
      setExtracted(extractedData);
      setStep("confirm");
    } catch (err: any) {
      console.error("[VoiceOrder]", err);
      const isTimeout = err?.name === "AbortError";
      toast({
        title: isTimeout ? "Voice service taking too long" : "Voice processing failed",
        description: isTimeout
          ? "Please try again."
          : (err?.message || "Try again or enter your order manually."),
        variant: "destructive",
      });
      setStep("record");
    }
  }

  // ─── Web Speech API recording (preferred) ───
  const startWebSpeechRecording = useCallback(() => {
    const SpeechRec = getSpeechRecognition();
    if (!SpeechRec) return;

    const recognition = new SpeechRec();
    recognition.lang = lang === "es" ? "es-ES" : "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    let finalText = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript + " ";
          setTranscript(finalText.trim());
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech") {
        toast({ title: "No speech detected", description: "Please try speaking again.", variant: "destructive" });
      } else if (event.error !== "aborted") {
        toast({ title: "Speech error", description: event.error, variant: "destructive" });
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      // If we have text, process it
      if (finalText.trim()) {
        processTranscript(finalText.trim());
      } else {
        setIsRecording(false);
      }
    };

    speechRecognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setTranscript("");
    setInterimTranscript("");

    // Auto-stop after 30 seconds
    recordingTimerRef.current = setTimeout(() => {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
    }, 30_000);
  }, [lang, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── MediaRecorder fallback recording ───
  const startMediaRecording = useCallback(async () => {
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Codec preference chain: mp4 first (iOS Safari), then webm, then browser default
      const codecPreferences = [
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ];
      const mimeType = codecPreferences.find((m) => MediaRecorder.isTypeSupported(m)) || "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const actualMime = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: actualMime });
        await processAudio(blob);
      };

      recorder.start();
      setIsRecording(true);

      // Auto-stop after 60 seconds to stay within Whisper's 25MB limit
      recordingTimerRef.current = setTimeout(() => {
        stopRecording();
        toast({
          title: "Recording limit reached",
          description: "Maximum 60 seconds. Processing your recording now.",
        });
      }, 60_000);
    } catch (err: any) {
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access and try again.",
        variant: "destructive",
      });
    }
  }, [lang, stopRecording]); // eslint-disable-line react-hooks/exhaustive-deps

  const startRecording = useCallback(() => {
    if (useWebSpeech) {
      startWebSpeechRecording();
    } else {
      startMediaRecording();
    }
  }, [useWebSpeech, startWebSpeechRecording, startMediaRecording]);

  function handleContinue() {
    // Prefill the order wizard via window globals.
    const tierName = extracted?.tierName || mapBagSize(editBagSize || extracted?.bagSize || null);
    // Pass canonical speed names (standard/next_day/same_day) matching wizard's normalizeDeliverySpeed
    const rawSpeed = editDeliverySpeed || extracted?.deliverySpeed || "standard";

    (window as any).__offload_voice_prefill = {
      tierName,
      deliverySpeed: rawSpeed,
      separated: extracted?.separated,
      clothingTypes: extracted?.clothingTypes ?? [],
      pickupAddress: editPickupAddress || extracted?.pickupAddress,
      scheduledPickup: extracted?.scheduledPickup,
      special_instructions: editNotes || extracted?.special_instructions,
      pickupDate: editPickupDate,
      pickupTimeWindow: editPickupWindow,
      customerNotes: editNotes,
      pickupAddressHint: editPickupAddress,
      serviceType: editServiceType || extracted?.serviceType,
    };

    navigate("/order/new");
    onClose();
  }

  function isMissing(field: string): boolean {
    return !!extracted?.missingFields?.includes(field);
  }

  function resetToRecord() {
    setStep("record");
    setExtracted(null);
    setTranscript("");
    setShowSpanishBeta(false);
  }

  function switchToEnglish() {
    setStep("record");
    setLang("en");
    setShowSpanishBeta(false);
  }

  return {
    step, lang, setLang,
    isRecording, transcript, interimTranscript,
    extracted, processingLabel,
    editBagSize, setEditBagSize,
    editServiceType, setEditServiceType,
    editDeliverySpeed, setEditDeliverySpeed,
    editPickupAddress, setEditPickupAddress,
    editPickupDate, setEditPickupDate,
    editPickupWindow, setEditPickupWindow,
    editNotes, setEditNotes,
    showSpanishBeta,
    voiceAvailable,
    stopRecording, startRecording,
    handleContinue, isMissing,
    resetToRecord, switchToEnglish,
    toast,
  };
}
