/**
 * Voice Order component — dual-mode speech input.
 *
 * Mode 1 (preferred): Web Speech API (SpeechRecognition) for browser-native
 *   real-time transcription with live interim results. Transcript is then sent
 *   to POST /api/voice/parse for GPT-4o-mini extraction.
 *
 * Mode 2 (fallback): MediaRecorder → POST /api/voice/transcribe (Whisper STT)
 *   → POST /api/voice/extract. Used when Web Speech API is unavailable.
 *
 * Both modes end at the same confirmation screen where every extracted field
 * is editable. "Continue to Order" prefills the wizard via window globals.
 *
 * SpeechSynthesis is used to verbally confirm intent before placing.
 *
 * Language rules:
 *  - English: fully supported.
 *  - Spanish: supported but flagged as Beta. If backend returns low confidence
 *    or language !== "es", show "Beta — English only" badge and offer switch.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import {
  Mic, MicOff, X, Check, ChevronDown, Loader2,
  AlertTriangle, Globe, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────

interface VoiceOrderProps {
  open: boolean;
  onClose: () => void;
}

interface PickupWindow {
  date?: string;
  timeStart?: string;
  timeEnd?: string;
}

interface Preferences {
  detergent?: string;
  washTemp?: string;
  addons?: string[];
  notes?: string;
}

interface ExtractedOrder {
  serviceType: "wash_fold" | "dry_cleaning" | "comforters" | "alterations" | "mixed" | null;
  bagSize: "small" | "medium" | "large" | "xl" | null;
  tierName?: string | null;
  deliverySpeed: "standard" | "next_day" | "same_day" | null;
  pickupAddress: string | null;
  scheduledPickup?: string | null;
  separated?: boolean;
  clothingTypes?: string[];
  special_instructions?: string | null;
  pickupWindow: PickupWindow | null;
  preferences: Preferences;
  confidence: { service: number; bagSize: number; address: number; window: number };
  missingFields: string[];
  language: "en" | "es";
}

// ─── Helpers ──────────────────────────────────────────────────

/** Map voice extraction deliverySpeed → schedule page speed value */
function mapDeliverySpeed(s: string | null): string {
  if (s === "same_day") return "same_day";
  if (s === "next_day") return "24h";
  return "48h"; // "standard" or null → default
}

/** Map voice bagSize → schedule tier name */
function mapBagSize(b: string | null): string | null {
  if (!b) return null;
  const map: Record<string, string> = {
    small: "small_bag",
    medium: "medium_bag",
    large: "large_bag",
    xl: "xl_bag",
  };
  return map[b] ?? null;
}

const CONFIDENCE_THRESHOLD = 0.6;

function isSpanishLowConfidence(extracted: ExtractedOrder | null, lang: "en" | "es"): boolean {
  if (lang !== "es" || !extracted) return false;
  const { service, bagSize } = extracted.confidence;
  return service < CONFIDENCE_THRESHOLD || bagSize < CONFIDENCE_THRESHOLD;
}

function bagSizeFromTier(tierName: string | null | undefined): ExtractedOrder["bagSize"] {
  if (!tierName) return null;
  const normalized = tierName.replace(/_bag$/, "");
  if (normalized === "small" || normalized === "medium" || normalized === "large" || normalized === "xl") {
    return normalized;
  }
  return null;
}

function normalizeVoiceParseResponse(data: any, fallbackLanguage: "en" | "es"): ExtractedOrder {
  const scheduled = data.scheduledPickup ? new Date(data.scheduledPickup) : null;
  const pickupWindow = scheduled && !Number.isNaN(scheduled.getTime())
    ? { date: scheduled.toISOString().split("T")[0] }
    : null;

  return {
    serviceType: data.serviceType ?? null,
    bagSize: data.bagSize ?? bagSizeFromTier(data.tierName),
    tierName: data.tierName ?? null,
    deliverySpeed: data.deliverySpeed ?? null,
    pickupAddress: data.pickupAddress ?? null,
    scheduledPickup: data.scheduledPickup ?? null,
    separated: data.separated === true,
    clothingTypes: Array.isArray(data.clothingTypes) ? data.clothingTypes : [],
    special_instructions: data.special_instructions ?? null,
    pickupWindow,
    preferences: { notes: data.special_instructions ?? "" },
    confidence: data.confidence ?? { service: 1, bagSize: 1, address: 1, window: 1 },
    missingFields: Array.isArray(data.missingFields) ? data.missingFields : [],
    language: data.language === "es" ? "es" : fallbackLanguage,
  };
}

// ─── Web Speech API helpers ──────────────────────────────────

// Web Speech API types (not always in lib.dom)
type SpeechRecognitionAny = any;

/** Check if Web Speech API (SpeechRecognition) is available */
function hasSpeechRecognition(): boolean {
  return !!(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
}

function getSpeechRecognition(): (new () => SpeechRecognitionAny) | null {
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

/** Speak a text string via SpeechSynthesis (verbal confirmation) */
function speak(text: string, lang: "en" | "es") {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "es" ? "es-ES" : "en-US";
  utterance.rate = 1.0;
  utterance.volume = 0.8;
  window.speechSynthesis.speak(utterance);
}

// ─── Main Component ───────────────────────────────────────────

type Step = "record" | "processing" | "confirm";

export function VoiceOrderModal({ open, onClose }: VoiceOrderProps) {
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

      // Pre-populate editable fields
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
      setExtracted(extractedData);
      setStep("confirm");

      // Verbal confirmation via SpeechSynthesis
      const bagLabel = extractedData.bagSize || "a";
      const svc = extractedData.serviceType as string | null;
      const serviceLabel = svc === "wash_fold" ? "standard wash"
        : svc === "wash_fold_signature" ? "signature wash"
        : svc === "wash_fold_custom" ? "custom wash" : "wash";
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

      // Pre-populate editable fields
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

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="voice-order-title">
      <Card className="w-full max-w-sm p-6 relative overflow-y-auto max-h-[90vh]">
        {/* Close */}
        <button
          onClick={() => { stopRecording(); onClose(); }}
          className="absolute top-3 right-3 w-11 h-11 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
          aria-label="Close voice order"
          data-testid="button-close-voice"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ── STEP: RECORD ── */}
        {step === "record" && (
          <>
            <div className="text-center mb-5">
              <div className="flex items-center justify-center gap-2 mb-1">
                <h3 id="voice-order-title" className="text-lg font-bold">Order by Voice</h3>
                <Badge
                  variant="secondary"
                  className="text-[10px] px-2 py-0.5 bg-red-500/15 text-red-600 border border-red-500/25"
                >
                  BETA
                </Badge>
                {lang === "es" && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-2 py-0.5 bg-amber-500/15 text-amber-600 border border-amber-500/25"
                  >
                    EN / ES only
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Tap the mic, describe your laundry order, then tap again to stop.
              </p>
            </div>

            {/* Endpoint unavailability banner */}
            {voiceAvailable === false && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-300 mb-5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-snug">
                  <strong>Voice ordering is currently in beta.</strong> The live voice endpoint is
                  temporarily unavailable while we configure our speech provider. Please use the{" "}
                  <a href="/schedule" className="underline font-medium">regular order form</a> for now.
                </p>
              </div>
            )}

            {/* Language toggle */}
            <div className="flex items-center justify-center gap-2 mb-5">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <button
                onClick={() => setLang("en")}
                className={cn(
                  "px-4 py-2 min-h-[44px] rounded-full text-xs font-medium transition-all",
                  lang === "en"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
                data-testid="button-lang-en"
              >
                English
              </button>
              <button
                onClick={() => setLang("es")}
                className={cn(
                  "px-4 py-2 min-h-[44px] rounded-full text-xs font-medium transition-all flex items-center gap-1",
                  lang === "es"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
                data-testid="button-lang-es"
              >
                Español <span className="text-[10px] font-semibold opacity-90">(beta)</span>
              </button>
            </div>

            {/* Mic button */}
            <div className="flex justify-center mb-5">
              <button
                onClick={voiceAvailable === false ? () => toast({
                  title: "Voice endpoint unavailable",
                  description: "The speech provider is not yet configured. Please use the regular order form.",
                  variant: "destructive",
                }) : (isRecording ? stopRecording : startRecording)}
                data-testid="button-mic"
                disabled={voiceAvailable === null}
                aria-disabled={voiceAvailable === false}
                className={cn(
                  "w-24 h-24 rounded-full flex items-center justify-center transition-all",
                  voiceAvailable === false
                    ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                    : isRecording
                    ? "bg-red-500 text-white scale-110 shadow-[0_0_40px_rgba(239,68,68,0.4)]"
                    : "bg-primary text-white hover:bg-primary/85 shadow-lg",
                )}
              >
                {isRecording ? (
                  <div className="relative">
                    <MicOff className="w-8 h-8" />
                    <span className="absolute inset-0 rounded-full border-2 border-white/30 animate-ping" />
                  </div>
                ) : (
                  <Mic className="w-8 h-8" />
                )}
              </button>
            </div>

            {/* Listening waveform + live transcription */}
            {isRecording && (
              <div className="mb-4">
                <div className="flex items-center justify-center gap-1.5 mb-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-1 bg-red-500 rounded-full animate-pulse"
                      style={{
                        height: `${14 + (i % 3) * 8}px`,
                        animationDelay: `${i * 120}ms`,
                      }}
                    />
                  ))}
                  <span className="text-xs text-muted-foreground ml-2">
                    Listening… tap to stop
                  </span>
                </div>
                {/* Live transcription display */}
                {(transcript || interimTranscript) && (
                  <div className="bg-muted/50 rounded-xl p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">We hear:</p>
                    <p className="text-sm">
                      {transcript && <span>{transcript} </span>}
                      {interimTranscript && <span className="text-muted-foreground italic">{interimTranscript}</span>}
                    </p>
                  </div>
                )}
              </div>
            )}

            {!isRecording && voiceAvailable !== false && (
              <>
                <p className="text-center text-xs text-muted-foreground">
                  {lang === "es"
                    ? 'Ejemplo: "Necesito una bolsa mediana, lavado estándar"'
                    : 'Example: "I need a medium bag, wash and fold, standard delivery"'}
                </p>
                <p className="text-center text-xs text-muted-foreground mt-1 italic">
                  We won't show a price until you review
                </p>
              </>
            )}
            {/* Language note always visible */}
            {voiceAvailable !== false && (
              <p className="text-center text-xs text-muted-foreground mt-2">
                Supported languages: <strong>English (EN)</strong> and <strong>Spanish (ES)</strong> only.
              </p>
            )}
          </>
        )}

        {/* ── STEP: PROCESSING ── */}
        {step === "processing" && (
          <div className="flex flex-col items-center justify-center py-10 gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm font-medium">{processingLabel}</p>
            <p className="text-xs text-muted-foreground">This takes just a moment…</p>
          </div>
        )}

        {/* ── STEP: CONFIRM ── */}
        {step === "confirm" && extracted && (
          <>
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold">Confirm Your Order</h3>
                {showSpanishBeta && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-2 py-0.5 bg-amber-500/15 text-amber-600 border border-amber-500/25"
                  >
                    Beta — English only
                  </Badge>
                )}
              </div>
              {transcript && (
                <p className="text-xs text-muted-foreground italic mb-2">
                  <span className="font-semibold not-italic">We heard:</span> "{transcript}"
                </p>
              )}
              {showSpanishBeta && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    Spanish extraction is in beta. Results may be less accurate. You can{" "}
                    <button
                      className="underline font-medium"
                      onClick={() => { setStep("record"); setLang("en"); setShowSpanishBeta(false); }}
                    >
                      switch to English
                    </button>
                    .
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Edit any field, then tap Continue.
              </p>
              <p className="text-xs text-muted-foreground italic mt-1">
                We won't show a price until you review
              </p>
            </div>

            <div className="space-y-3">
              {/* Service Type */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label className="text-xs font-medium">Service Type</Label>
                  {isMissing("serviceType") && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      needs your input
                    </Badge>
                  )}
                </div>
                <Select value={editServiceType} onValueChange={setEditServiceType}>
                  <SelectTrigger className="h-11 text-sm" data-testid="select-service-type">
                    <SelectValue placeholder="Select service…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wash_fold">Wash & Fold</SelectItem>
                    <SelectItem value="dry_cleaning">Dry Cleaning</SelectItem>
                    <SelectItem value="comforters">Comforters / Bedding</SelectItem>
                    <SelectItem value="alterations">Alterations</SelectItem>
                    <SelectItem value="mixed">Mixed (multiple services)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Bag Size */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label className="text-xs font-medium">Bag Size</Label>
                  {isMissing("bagSize") && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      needs your input
                    </Badge>
                  )}
                </div>
                <Select value={editBagSize} onValueChange={setEditBagSize}>
                  <SelectTrigger className="h-11 text-sm" data-testid="select-bag-size">
                    <SelectValue placeholder="Select bag size…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small — up to 10 lbs ($24.99)</SelectItem>
                    <SelectItem value="medium">Medium — up to 20 lbs ($44.99)</SelectItem>
                    <SelectItem value="large">Large — up to 30 lbs ($59.99)</SelectItem>
                    <SelectItem value="xl">XL — up to 50 lbs ($89.99)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Delivery Speed */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label className="text-xs font-medium">Delivery Speed</Label>
                  {isMissing("deliverySpeed") && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      needs your input
                    </Badge>
                  )}
                </div>
                <Select value={editDeliverySpeed} onValueChange={setEditDeliverySpeed}>
                  <SelectTrigger className="h-11 text-sm" data-testid="select-delivery-speed">
                    <SelectValue placeholder="Select speed…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard (2 days)</SelectItem>
                    <SelectItem value="next_day">Next Day</SelectItem>
                    <SelectItem value="same_day">Same Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Pickup Address */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label className="text-xs font-medium">Pickup Address</Label>
                  {isMissing("pickupAddress") && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      needs your input
                    </Badge>
                  )}
                </div>
                <Input
                  className="h-11 text-sm"
                  placeholder="e.g. 123 Main St, Brooklyn"
                  value={editPickupAddress}
                  onChange={(e) => setEditPickupAddress(e.target.value)}
                  data-testid="input-pickup-address"
                />
              </div>

              {/* Pickup Date */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label className="text-xs font-medium">Pickup Date</Label>
                  {isMissing("pickupWindow") && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      needs your input
                    </Badge>
                  )}
                </div>
                <Input
                  className="h-11 text-sm"
                  type="date"
                  value={editPickupDate}
                  onChange={(e) => setEditPickupDate(e.target.value)}
                  data-testid="input-pickup-date"
                />
              </div>

              {/* Pickup Time Window */}
              <div>
                <Label className="text-xs font-medium mb-1 block">Pickup Time Window</Label>
                <Input
                  className="h-11 text-sm"
                  placeholder="e.g. 8 AM – 10 AM"
                  value={editPickupWindow}
                  onChange={(e) => setEditPickupWindow(e.target.value)}
                  data-testid="input-pickup-window"
                />
              </div>

              {/* Notes */}
              <div>
                <Label className="text-xs font-medium mb-1 block">Notes / Preferences</Label>
                <Input
                  className="h-11 text-sm"
                  placeholder="e.g. warm water, unscented detergent"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  data-testid="input-voice-notes"
                />
              </div>
            </div>

            <div className="space-y-2 mt-5">
              <Button
                className="w-full bg-primary hover:bg-primary/85"
                onClick={handleContinue}
                data-testid="button-confirm-voice"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Continue to Order
              </Button>
              <Button
                variant="ghost"
                className="w-full text-xs"
                onClick={() => { setStep("record"); setExtracted(null); setTranscript(""); setShowSpanishBeta(false); }}
                data-testid="button-retry-voice"
              >
                <Mic className="w-3.5 h-3.5 mr-1" />
                Record again
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>,
    document.body,
  );
}
