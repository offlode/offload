import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Mic, MicOff, X, Check, Edit2, Loader2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface VoiceOrderProps {
  open: boolean;
  onClose: () => void;
}

interface ParsedOrder {
  tierName?: string;
  displayName?: string;
  price?: number;
  date?: string;
  time?: string;
  raw: string;
}

// Check for SpeechRecognition support
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

function parseTranscript(text: string): ParsedOrder {
  const lower = text.toLowerCase();
  let tierName: string | undefined;
  let displayName: string | undefined;
  let price: number | undefined;

  if (lower.includes("small")) { tierName = "small_bag"; displayName = "Small Bag"; price = 24.99; }
  else if (lower.includes("extra large") || lower.includes("xl") || lower.includes("extra-large")) { tierName = "xl_bag"; displayName = "XL Bag"; price = 89.99; }
  else if (lower.includes("large")) { tierName = "large_bag"; displayName = "Large Bag"; price = 59.99; }
  else if (lower.includes("medium")) { tierName = "medium_bag"; displayName = "Medium Bag"; price = 44.99; }

  // Try to parse date/time
  let date: string | undefined;
  let time: string | undefined;
  if (lower.includes("tomorrow")) date = "Tomorrow";
  else if (lower.includes("today")) date = "Today";
  else if (lower.includes("next week")) date = "Next week";

  const timeMatch = lower.match(/(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/);
  if (timeMatch) time = `${timeMatch[1]} ${timeMatch[2].replace(".", "")}`;
  if (lower.includes("morning")) time = time || "Morning";
  else if (lower.includes("afternoon")) time = time || "Afternoon";
  else if (lower.includes("evening")) time = time || "Evening";

  return { tierName, displayName, price, date, time, raw: text };
}

export function VoiceOrderModal({ open, onClose }: VoiceOrderProps) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsedOrder, setParsedOrder] = useState<ParsedOrder | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasSupport, setHasSupport] = useState(!!SpeechRecognition);
  const recognitionRef = useRef<any>(null);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognition) {
      setHasSupport(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += t;
        else interimTranscript += t;
      }
      setTranscript(finalTranscript || interimTranscript);
      if (finalTranscript) {
        const parsed = parseTranscript(finalTranscript);
        setParsedOrder(parsed);
        setIsListening(false);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech") {
        toast({ title: "Voice error", description: `Speech recognition error: ${event.error}`, variant: "destructive" });
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setTranscript("");
    setParsedOrder(null);
  }, [toast]);

  useEffect(() => {
    return () => { stopListening(); };
  }, [stopListening]);

  const handleConfirm = () => {
    if (parsedOrder?.tierName) {
      (window as any).__offload_voice_tier = parsedOrder.tierName;
    }
    navigate("/schedule");
    onClose();
  };

  const handleSendToAI = async () => {
    if (!transcript) return;
    setIsProcessing(true);
    try {
      const res = await apiRequest("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message: transcript }),
      });
      const data = await res.json();
      toast({ title: "AI Response", description: data.reply?.substring(0, 100) || "Processed your request." });
      if (data.actions?.some((a: any) => a.type === "navigate")) {
        navigate("/schedule");
        onClose();
      }
    } catch {
      toast({ title: "Could not process", description: "Try again or use the schedule page.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6 relative">
        <button
          onClick={() => { stopListening(); onClose(); }}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
          data-testid="button-close-voice"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-6">
          <h3 className="text-lg font-bold mb-1">Order by Voice</h3>
          <p className="text-xs text-muted-foreground">
            {hasSupport ? "Tap the mic and tell us what you need" : "Voice not supported in this browser"}
          </p>
        </div>

        {/* Mic Button */}
        <div className="flex justify-center mb-6">
          <button
            onClick={isListening ? stopListening : startListening}
            disabled={!hasSupport}
            data-testid="button-mic"
            className={cn(
              "w-24 h-24 rounded-full flex items-center justify-center transition-all",
              isListening
                ? "bg-red-500 text-white scale-110 shadow-[0_0_40px_rgba(239,68,68,0.4)]"
                : hasSupport
                ? "bg-primary text-white hover:bg-primary/85 shadow-lg"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {isListening ? (
              <div className="relative">
                <MicOff className="w-8 h-8" />
                {/* Pulse rings */}
                <span className="absolute inset-0 rounded-full border-2 border-white/30 animate-ping" />
              </div>
            ) : (
              <Mic className="w-8 h-8" />
            )}
          </button>
        </div>

        {/* Listening indicator */}
        {isListening && (
          <div className="flex items-center justify-center gap-1.5 mb-4">
            {[0, 1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="w-1 bg-primary rounded-full animate-pulse"
                style={{
                  height: `${12 + Math.random() * 20}px`,
                  animationDelay: `${i * 100}ms`,
                  animationDuration: "0.5s",
                }}
              />
            ))}
            <span className="text-xs text-muted-foreground ml-2">Listening...</span>
          </div>
        )}

        {/* Transcript */}
        {transcript && (
          <div className="mb-4 p-3 rounded-xl bg-muted">
            <p className="text-xs text-muted-foreground mb-1">I heard:</p>
            <p className="text-sm font-medium">{transcript}</p>
          </div>
        )}

        {/* Parsed order details */}
        {parsedOrder && (
          <div className="mb-4 p-3 rounded-xl bg-primary/5 border border-primary/20">
            <p className="text-xs text-primary font-medium mb-2">Detected order details:</p>
            <div className="space-y-1">
              {parsedOrder.displayName && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Bag Size</span>
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    {parsedOrder.displayName}
                  </Badge>
                </div>
              )}
              {parsedOrder.price && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-semibold">${parsedOrder.price}</span>
                </div>
              )}
              {parsedOrder.date && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">When</span>
                  <span>{parsedOrder.date} {parsedOrder.time || ""}</span>
                </div>
              )}
              {!parsedOrder.displayName && (
                <p className="text-xs text-muted-foreground italic">
                  Couldn't detect bag size. You can pick on the schedule page.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {parsedOrder && (
          <div className="space-y-2">
            <Button
              className="w-full bg-primary hover:bg-primary/85"
              onClick={handleConfirm}
              data-testid="button-confirm-voice"
            >
              <Check className="w-4 h-4 mr-2" />
              {parsedOrder.displayName ? `Continue with ${parsedOrder.displayName}` : "Go to Schedule"}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => { setTranscript(""); setParsedOrder(null); startListening(); }}
                data-testid="button-retry-voice"
              >
                <Mic className="w-4 h-4 mr-1" />
                Try Again
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => { navigate("/schedule"); onClose(); }}
                data-testid="button-manual-order"
              >
                <Edit2 className="w-4 h-4 mr-1" />
                Edit Manually
              </Button>
            </div>
          </div>
        )}

        {/* Send to AI for processing */}
        {transcript && !parsedOrder?.displayName && (
          <Button
            variant="outline"
            className="w-full mt-2"
            onClick={handleSendToAI}
            disabled={isProcessing}
          >
            {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Volume2 className="w-4 h-4 mr-2" />}
            Ask AI to Help
          </Button>
        )}

        {/* Fallback for no browser support */}
        {!hasSupport && (
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Your browser doesn't support speech recognition. Try Chrome or Edge, or use the schedule page to order manually.
            </p>
            <Button
              className="w-full bg-primary hover:bg-primary/85"
              onClick={() => { navigate("/schedule"); onClose(); }}
            >
              Go to Schedule Page
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
