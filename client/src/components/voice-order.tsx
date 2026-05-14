/**
 * Voice Order component — real Whisper STT + GPT-4o-mini extraction.
 *
 * Flow:
 *  1. User picks language (English / Spanish-beta) and taps record.
 *  2. Audio recorded via MediaRecorder API → POST /api/voice/transcribe.
 *  3. Transcript → POST /api/voice/extract.
 *  4. Confirmation screen with every extracted field as editable input.
 *     Missing fields shown in amber with "needs your input" badge.
 *  5. "Continue to Schedule" prefills the schedule page via window globals
 *     (same pattern as __offload_wash_type) and navigates.
 *
 * Language rules:
 *  - English: fully supported.
 *  - Spanish: supported but flagged as Beta. If backend returns low confidence
 *    or language !== "es", show "Beta — English only" badge and offer switch.
 */

import { useState, useRef, useCallback, useEffect } from "react";
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
  deliverySpeed: "standard" | "next_day" | "same_day" | null;
  pickupAddress: string | null;
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

// ─── Main Component ───────────────────────────────────────────

type Step = "record" | "processing" | "confirm";

export function VoiceOrderModal({ open, onClose }: VoiceOrderProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("record");
  const [lang, setLang] = useState<"en" | "es">("en");
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on open and check voice endpoint health
  useEffect(() => {
    if (open) {
      setStep("record");
      setIsRecording(false);
      setTranscript("");
      setExtracted(null);
      setShowSpanishBeta(false);
      chunksRef.current = [];
      // Check whether the live voice endpoint is available
      setVoiceAvailable(null);
      fetch("/api/voice/health", { credentials: "include" })
        .then((r) => r.json())
        .then((data) => setVoiceAvailable(!!data.available))
        .catch(() => setVoiceAvailable(false));
    }
  }, [open]);

  const stopRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
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
        // Use the actual MIME type from the recorder (more reliable than our preference)
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

  async function processAudio(blob: Blob) {
    setStep("processing");
    setProcessingLabel("Processing your voice…");

    const formData = new FormData();
    const ext = blob.type.includes("mp4") ? "mp4"
      : blob.type.includes("ogg") ? "ogg"
      : blob.type.includes("webm") ? "webm"
      : "webm";
    formData.append("audio", blob, `voice.${ext}`);
    formData.append("language", lang);

    try {
      let extractedData: ExtractedOrder | null = null;
      let text = "";
      let detectedLang: "en" | "es" = lang;

      // Try the unified parse endpoint first
      // TODO: Once POST /api/voice/parse is live, remove the fallback transcribe+extract path
      let usedParse = false;
      try {
        const parseController = new AbortController();
        const parseTimeout = setTimeout(() => parseController.abort(), 30_000);

        let parseRes: Response;
        try {
          parseRes = await fetch("/api/voice/parse", {
            method: "POST",
            body: formData,
            credentials: "include",
            signal: parseController.signal,
          });
        } finally {
          clearTimeout(parseTimeout);
        }

        if (parseRes.ok) {
          const parseData = await parseRes.json();
          extractedData = parseData as ExtractedOrder;
          text = parseData.transcript || "";
          detectedLang = parseData.language || lang;
          setTranscript(text);
          usedParse = true;
        } else if (parseRes.status !== 404) {
          // Non-404 error — still fall back but log the issue
          console.warn("[VoiceOrder] /api/voice/parse returned", parseRes.status, "— falling back to transcribe+extract");
        }
      } catch (parseErr: any) {
        // Parse endpoint not available — fall back silently
        console.warn("[VoiceOrder] /api/voice/parse unavailable — falling back to transcribe+extract", parseErr?.message);
      }

      // Fallback: transcribe → extract (two-step flow)
      if (!usedParse) {
        setProcessingLabel("Transcribing your voice…");

        const transcribeController = new AbortController();
        const transcribeTimeout = setTimeout(() => transcribeController.abort(), 30_000);

        let transcribeRes: Response;
        try {
          transcribeRes = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: formData,
            credentials: "include",
            signal: transcribeController.signal,
          });
        } finally {
          clearTimeout(transcribeTimeout);
        }

        if (!transcribeRes.ok) {
          const err = await transcribeRes.json().catch(() => ({}));
          if (transcribeRes.status === 429) {
            toast({ title: "Too many requests", description: "Wait a moment and try again.", variant: "destructive" });
            setStep("record");
            return;
          }
          throw new Error(err.error || "Transcription failed");
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

        text = transcribeData.text || "";
        detectedLang = transcribeData.language || "en";
        setTranscript(text);

        setProcessingLabel("Extracting order details…");

        const extractController = new AbortController();
        const extractTimeout = setTimeout(() => extractController.abort(), 30_000);

        let extractRes: Response;
        try {
          extractRes = await fetch("/api/voice/extract", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript: text, language: detectedLang }),
            signal: extractController.signal,
          });
        } finally {
          clearTimeout(extractTimeout);
        }

        if (!extractRes.ok) {
          const err = await extractRes.json().catch(() => ({}));
          throw new Error(err.error || "Extraction failed");
        }

        extractedData = await extractRes.json();
      }

      if (!extractedData) {
        throw new Error("No extraction data returned");
      }

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
      setEditNotes(extractedData.preferences?.notes || "");
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
    // Prefill schedule page via window globals (same pattern as __offload_wash_type)
    const tierName = mapBagSize(editBagSize || extracted?.bagSize || null);
    const speed = mapDeliverySpeed(editDeliverySpeed || extracted?.deliverySpeed || null);

    (window as any).__offload_voice_prefill = {
      tierName,
      deliverySpeed: speed,
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

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6 relative overflow-y-auto max-h-[90vh]">
        {/* Close */}
        <button
          onClick={() => { stopRecording(); onClose(); }}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
          data-testid="button-close-voice"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ── STEP: RECORD ── */}
        {step === "record" && (
          <>
            <div className="text-center mb-5">
              <div className="flex items-center justify-center gap-2 mb-1">
                <h3 className="text-lg font-bold">Order by Voice</h3>
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
                  "px-3 py-1 rounded-full text-xs font-medium transition-all",
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
                  "px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1",
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

            {/* Listening waveform */}
            {isRecording && (
              <div className="flex items-center justify-center gap-1.5 mb-4">
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
                  Recording… tap to stop
                </span>
              </div>
            )}

            {!isRecording && voiceAvailable !== false && (
              <p className="text-center text-xs text-muted-foreground">
                Example: "I need a medium bag, wash and fold, standard delivery"
              </p>
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
            </div>

            <div className="space-y-3">
              {/* Service Type */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label className="text-xs font-medium">Service Type</Label>
                  {isMissing("serviceType") && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-400">
                      needs your input
                    </Badge>
                  )}
                </div>
                <Select value={editServiceType} onValueChange={setEditServiceType}>
                  <SelectTrigger className="h-9 text-sm" data-testid="select-service-type">
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
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-400">
                      needs your input
                    </Badge>
                  )}
                </div>
                <Select value={editBagSize} onValueChange={setEditBagSize}>
                  <SelectTrigger className="h-9 text-sm" data-testid="select-bag-size">
                    <SelectValue placeholder="Select bag size…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small (~10-15 lbs)</SelectItem>
                    <SelectItem value="medium">Medium (~20-25 lbs)</SelectItem>
                    <SelectItem value="large">Large (~30-35 lbs)</SelectItem>
                    <SelectItem value="xl">XL (~40+ lbs)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Delivery Speed */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label className="text-xs font-medium">Delivery Speed</Label>
                  {isMissing("deliverySpeed") && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-400">
                      needs your input
                    </Badge>
                  )}
                </div>
                <Select value={editDeliverySpeed} onValueChange={setEditDeliverySpeed}>
                  <SelectTrigger className="h-9 text-sm" data-testid="select-delivery-speed">
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
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-400">
                      needs your input
                    </Badge>
                  )}
                </div>
                <Input
                  className="h-9 text-sm"
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
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-400">
                      needs your input
                    </Badge>
                  )}
                </div>
                <Input
                  className="h-9 text-sm"
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
                  className="h-9 text-sm"
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
                  className="h-9 text-sm"
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
    </div>
  );
}
