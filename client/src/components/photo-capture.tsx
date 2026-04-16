import { useState, useRef, useCallback } from "react";
import { Camera, X, Check, RotateCcw, MapPin } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type PhotoType = "pickup_proof" | "delivery_proof" | "intake_before" | "intake_after" | "damage" | "quality_check";

interface PhotoCaptureProps {
  orderId: number;
  type: PhotoType;
  label?: string;
  onCapture?: (photoId: number) => void;
  className?: string;
}

export function PhotoCapture({ orderId, type, label, onCapture, className = "" }: PhotoCaptureProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  const captureLocation = useCallback(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}, // Ignore errors silently
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  const uploadMutation = useMutation({
    mutationFn: async (photoData: string) => {
      const res = await apiRequest(`/api/orders/${orderId}/photos`, {
        method: "POST",
        body: JSON.stringify({
          type,
          photoData,
          lat: location?.lat,
          lng: location?.lng,
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Photo saved" });
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/photos`] });
      onCapture?.(data.id);
    },
    onError: (err: any) => {
      toast({ title: "Failed to save photo", description: err.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    captureLocation();

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setPreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = () => {
    if (preview) {
      uploadMutation.mutate(preview);
    }
  };

  const handleRetake = () => {
    setPreview(null);
    setLocation(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const typeLabels: Record<PhotoType, string> = {
    pickup_proof: "Pickup Proof",
    delivery_proof: "Delivery Proof",
    intake_before: "Before Washing",
    intake_after: "After Washing",
    damage: "Damage Report",
    quality_check: "Quality Check",
  };

  const displayLabel = label || typeLabels[type];

  return (
    <div className={`rounded-2xl border border-border bg-card overflow-hidden ${className}`} data-testid={`photo-capture-${type}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {!preview && !uploadMutation.isSuccess && (
        <button
          type="button"
          onClick={() => {
            captureLocation();
            fileInputRef.current?.click();
          }}
          className="w-full aspect-[4/3] flex flex-col items-center justify-center gap-3 hover:bg-muted/30 transition-colors"
        >
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <Camera className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">{displayLabel}</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">Tap to capture</p>
          </div>
        </button>
      )}

      {preview && !uploadMutation.isSuccess && (
        <div className="relative">
          <img src={preview} alt="Preview" className="w-full aspect-[4/3] object-cover" />
          {location && (
            <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 text-white text-xs">
              <MapPin className="w-3 h-3" />
              GPS
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex gap-2">
            <button
              type="button"
              onClick={handleRetake}
              className="flex-1 py-2 rounded-full bg-white/20 text-white text-sm font-medium flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              Retake
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={uploadMutation.isPending}
              className="flex-1 py-2 rounded-full bg-green-500 text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {uploadMutation.isPending ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Save
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {uploadMutation.isSuccess && (
        <div className="w-full aspect-[4/3] flex flex-col items-center justify-center gap-3 bg-green-500/5">
          <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check className="w-6 h-6 text-green-400" />
          </div>
          <p className="text-sm font-medium text-green-400">{displayLabel} saved</p>
          <button
            type="button"
            onClick={handleRetake}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Retake photo
          </button>
        </div>
      )}
    </div>
  );
}
