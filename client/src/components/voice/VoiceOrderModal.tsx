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

import { createPortal } from "react-dom";
import {
  Mic, MicOff, X, Loader2, AlertTriangle, Globe,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VoiceOrderProps } from "./types";
import { useVoiceRecording } from "./useVoiceRecording";
import { VoiceOrderConfirmation } from "./VoiceOrderConfirmation";

export function VoiceOrderModal({ open, onClose }: VoiceOrderProps) {
  const voice = useVoiceRecording(open, onClose);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="voice-order-title">
      <Card className="w-full max-w-sm p-6 relative overflow-y-auto max-h-[90vh]">
        {/* Close */}
        <button
          onClick={() => { voice.stopRecording(); onClose(); }}
          className="absolute top-3 right-3 w-11 h-11 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
          aria-label="Close voice order"
          data-testid="button-close-voice"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ── STEP: RECORD ── */}
        {voice.step === "record" && (
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
                {voice.lang === "es" && (
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
            {voice.voiceAvailable === false && (
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
                onClick={() => voice.setLang("en")}
                className={cn(
                  "px-4 py-2 min-h-[44px] rounded-full text-xs font-medium transition-all",
                  voice.lang === "en"
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
                data-testid="button-lang-en"
              >
                English
              </button>
              <button
                onClick={() => voice.setLang("es")}
                className={cn(
                  "px-4 py-2 min-h-[44px] rounded-full text-xs font-medium transition-all flex items-center gap-1",
                  voice.lang === "es"
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
                onClick={voice.voiceAvailable === false ? () => voice.toast({
                  title: "Voice endpoint unavailable",
                  description: "The speech provider is not yet configured. Please use the regular order form.",
                  variant: "destructive",
                }) : (voice.isRecording ? voice.stopRecording : voice.startRecording)}
                data-testid="button-mic"
                disabled={voice.voiceAvailable === null}
                aria-disabled={voice.voiceAvailable === false}
                className={cn(
                  "w-24 h-24 rounded-full flex items-center justify-center transition-all",
                  voice.voiceAvailable === false
                    ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                    : voice.isRecording
                    ? "bg-red-500 text-white scale-110 shadow-[0_0_40px_rgba(239,68,68,0.4)]"
                    : "bg-primary text-white hover:bg-primary/85 shadow-lg",
                )}
              >
                {voice.isRecording ? (
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
            {voice.isRecording && (
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
                {(voice.transcript || voice.interimTranscript) && (
                  <div className="bg-muted/50 rounded-xl p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">We hear:</p>
                    <p className="text-sm">
                      {voice.transcript && <span>{voice.transcript} </span>}
                      {voice.interimTranscript && <span className="text-muted-foreground italic">{voice.interimTranscript}</span>}
                    </p>
                  </div>
                )}
              </div>
            )}

            {!voice.isRecording && voice.voiceAvailable !== false && (
              <>
                <p className="text-center text-xs text-muted-foreground">
                  {voice.lang === "es"
                    ? 'Ejemplo: "Necesito una bolsa mediana, lavado estándar"'
                    : 'Example: "I need a medium bag, wash and fold, standard delivery"'}
                </p>
                <p className="text-center text-xs text-muted-foreground mt-1 italic">
                  We won't show a price until you review
                </p>
              </>
            )}
            {/* Language note always visible */}
            {voice.voiceAvailable !== false && (
              <p className="text-center text-xs text-muted-foreground mt-2">
                Supported languages: <strong>English (EN)</strong> and <strong>Spanish (ES)</strong> only.
              </p>
            )}
          </>
        )}

        {/* ── STEP: PROCESSING ── */}
        {voice.step === "processing" && (
          <div className="flex flex-col items-center justify-center py-10 gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm font-medium">{voice.processingLabel}</p>
            <p className="text-xs text-muted-foreground">This takes just a moment…</p>
          </div>
        )}

        {/* ── STEP: CONFIRM ── */}
        {voice.step === "confirm" && voice.extracted && (
          <VoiceOrderConfirmation
            extracted={voice.extracted}
            transcript={voice.transcript}
            showSpanishBeta={voice.showSpanishBeta}
            editBagSize={voice.editBagSize}
            setEditBagSize={voice.setEditBagSize}
            editServiceType={voice.editServiceType}
            setEditServiceType={voice.setEditServiceType}
            editDeliverySpeed={voice.editDeliverySpeed}
            setEditDeliverySpeed={voice.setEditDeliverySpeed}
            editPickupAddress={voice.editPickupAddress}
            setEditPickupAddress={voice.setEditPickupAddress}
            editPickupDate={voice.editPickupDate}
            setEditPickupDate={voice.setEditPickupDate}
            editPickupWindow={voice.editPickupWindow}
            setEditPickupWindow={voice.setEditPickupWindow}
            editNotes={voice.editNotes}
            setEditNotes={voice.setEditNotes}
            isMissing={voice.isMissing}
            handleContinue={voice.handleContinue}
            resetToRecord={voice.resetToRecord}
            switchToEnglish={voice.switchToEnglish}
          />
        )}
      </Card>
    </div>,
    document.body,
  );
}
