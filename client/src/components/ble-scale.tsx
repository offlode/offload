import { useState, useCallback, useRef } from "react";
import { Bluetooth, BluetoothOff, Scale, Check, Minus, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface BleScaleProps {
  orderId: number;
  weightType: "dirty" | "clean";
  onWeightRecorded?: (weight: number) => void;
  actorId?: number;
}

const hasBluetooth = typeof navigator !== "undefined" && "bluetooth" in navigator;

// Weight Scale Service UUID (Bluetooth SIG)
const WEIGHT_SCALE_SERVICE = 0x181D;
const WEIGHT_MEASUREMENT_CHAR = 0x2A9D;

export function BleScale({ orderId, weightType, onWeightRecorded, actorId }: BleScaleProps) {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [rawWeight, setRawWeight] = useState<number | null>(null);
  const [tareOffset, setTareOffset] = useState(0);
  const [isStable, setIsStable] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [manualWeight, setManualWeight] = useState("");
  const [useManual, setUseManual] = useState(!hasBluetooth);

  const deviceRef = useRef<any>(null);
  const characteristicRef = useRef<any>(null);
  const lastReadings = useRef<number[]>([]);

  const connectScale = useCallback(async () => {
    if (!hasBluetooth) {
      toast({ title: "Bluetooth not available", description: "Use manual entry instead.", variant: "destructive" });
      setUseManual(true);
      return;
    }

    setIsConnecting(true);
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: [WEIGHT_SCALE_SERVICE] }],
        optionalServices: [WEIGHT_SCALE_SERVICE],
      });

      deviceRef.current = device;
      setDeviceName(device.name || "BLE Scale");

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(WEIGHT_SCALE_SERVICE);
      const characteristic = await service.getCharacteristic(WEIGHT_MEASUREMENT_CHAR);

      characteristicRef.current = characteristic;

      await characteristic.startNotifications();
      characteristic.addEventListener("characteristicvaluechanged", (event: any) => {
        const value = event.target.value;
        // Parse weight measurement per Bluetooth spec
        // Byte 0: flags, Bytes 1-2: weight (uint16, little-endian)
        const flags = value.getUint8(0);
        const isKg = !(flags & 0x01); // bit 0: 0 = SI (kg), 1 = Imperial (lb)
        let weight = value.getUint16(1, true); // little-endian

        // Resolution is 0.005 kg for SI or 0.01 lb for imperial
        if (isKg) {
          weight = weight * 0.005 * 2.20462; // convert kg to lbs
        } else {
          weight = weight * 0.01;
        }

        weight = Math.round(weight * 100) / 100;
        setRawWeight(weight);

        // Track last 5 readings for stability detection
        lastReadings.current.push(weight);
        if (lastReadings.current.length > 5) lastReadings.current.shift();

        if (lastReadings.current.length >= 3) {
          const variance = Math.max(...lastReadings.current) - Math.min(...lastReadings.current);
          setIsStable(variance < 0.1);
        }
      });

      setIsConnected(true);
      toast({ title: "Scale connected", description: `Connected to ${device.name || "BLE Scale"}` });
    } catch (err: any) {
      if (err.name === "NotFoundError") {
        toast({ title: "No scale found", description: "Make sure your Bluetooth scale is on and nearby." });
      } else {
        toast({ title: "Connection failed", description: err.message || "Could not connect to scale.", variant: "destructive" });
      }
    } finally {
      setIsConnecting(false);
    }
  }, [toast]);

  const handleTare = () => {
    if (rawWeight !== null) {
      setTareOffset(rawWeight);
      toast({ title: "Tared", description: `Bag weight of ${rawWeight} lbs subtracted.` });
    }
  };

  const effectiveWeight = rawWeight !== null ? Math.max(0, rawWeight - tareOffset) : null;

  const recordWeight = async (weight: number) => {
    setIsSaving(true);
    try {
      await apiRequest(`/api/orders/${orderId}/ble-weight`, {
        method: "POST",
        body: JSON.stringify({
          weight,
          deviceName: deviceName || "manual",
          rawReading: rawWeight,
          taredReading: effectiveWeight,
          weightType,
          actorId,
        }),
      });
      setSaved(true);
      onWeightRecorded?.(weight);
      toast({ title: "Weight recorded", description: `${weight} lbs recorded as ${weightType} weight.` });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (saved) {
    return (
      <Card className="p-4 border-emerald-500/30 bg-emerald-500/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Check className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-400">
              {weightType === "dirty" ? "Dirty" : "Clean"} Weight Recorded
            </p>
            <p className="text-xs text-muted-foreground">
              {effectiveWeight?.toFixed(2) || manualWeight} lbs {deviceName ? `via ${deviceName}` : "(manual)"}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Scale className="w-4 h-4 text-primary" />
          {weightType === "dirty" ? "Dirty" : "Clean"} Weight
        </h4>
        {!useManual && hasBluetooth && (
          <button
            className="text-xs text-muted-foreground underline"
            onClick={() => setUseManual(true)}
          >
            Enter manually
          </button>
        )}
        {useManual && hasBluetooth && (
          <button
            className="text-xs text-muted-foreground underline"
            onClick={() => setUseManual(false)}
          >
            Use BLE scale
          </button>
        )}
      </div>

      {!useManual ? (
        <>
          {/* BLE Connection */}
          {!isConnected ? (
            <div className="text-center py-4">
              <Button
                onClick={connectScale}
                disabled={isConnecting}
                className="bg-primary hover:bg-primary/85"
                data-testid="button-connect-scale"
              >
                {isConnecting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning...</>
                ) : (
                  <><Bluetooth className="w-4 h-4 mr-2" /> Connect Scale</>
                )}
              </Button>
              {!hasBluetooth && (
                <p className="text-xs text-amber-400 mt-2 flex items-center justify-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Web Bluetooth not supported. Try Chrome on Android/Desktop.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Connected state */}
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400 text-xs">
                  <Bluetooth className="w-3 h-3 mr-1" /> {deviceName}
                </Badge>
                {isStable ? (
                  <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400 text-xs">Stable</Badge>
                ) : (
                  <Badge variant="secondary" className="bg-amber-500/15 text-amber-400 text-xs">Stabilizing...</Badge>
                )}
              </div>

              {/* Weight display */}
              <div className="text-center py-4 mb-3 rounded-xl bg-muted">
                <p className="text-4xl font-bold tabular-nums" data-testid="text-ble-weight">
                  {effectiveWeight !== null ? effectiveWeight.toFixed(2) : "---"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">lbs</p>
                {tareOffset > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">Tare: -{tareOffset.toFixed(2)} lbs</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleTare}
                  className="flex-1"
                  data-testid="button-tare"
                >
                  <Minus className="w-3.5 h-3.5 mr-1" /> Tare
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-primary hover:bg-primary/85"
                  disabled={effectiveWeight === null || effectiveWeight <= 0 || isSaving}
                  onClick={() => effectiveWeight && recordWeight(effectiveWeight)}
                  data-testid="button-record-weight"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                  Record
                </Button>
              </div>
            </>
          )}
        </>
      ) : (
        /* Manual entry fallback */
        <div>
          <div className="relative mb-3">
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder="Enter weight"
              value={manualWeight}
              onChange={(e) => setManualWeight(e.target.value)}
              className="w-full h-11 px-4 pr-12 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              data-testid="input-manual-weight"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">lbs</span>
          </div>
          <Button
            className="w-full bg-primary hover:bg-primary/85"
            disabled={!manualWeight || parseFloat(manualWeight) <= 0 || isSaving}
            onClick={() => recordWeight(parseFloat(manualWeight))}
            data-testid="button-record-manual"
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            Record {weightType === "dirty" ? "Dirty" : "Clean"} Weight
          </Button>
        </div>
      )}
    </Card>
  );
}
