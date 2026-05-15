/**
 * Voice Order confirmation step — editable fields extracted from voice input.
 */

import { Mic, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ExtractedOrder } from "./types";

interface VoiceOrderConfirmationProps {
  extracted: ExtractedOrder;
  transcript: string;
  showSpanishBeta: boolean;
  editBagSize: string;
  setEditBagSize: (v: string) => void;
  editServiceType: string;
  setEditServiceType: (v: string) => void;
  editDeliverySpeed: string;
  setEditDeliverySpeed: (v: string) => void;
  editPickupAddress: string;
  setEditPickupAddress: (v: string) => void;
  editPickupDate: string;
  setEditPickupDate: (v: string) => void;
  editPickupWindow: string;
  setEditPickupWindow: (v: string) => void;
  editNotes: string;
  setEditNotes: (v: string) => void;
  isMissing: (field: string) => boolean;
  handleContinue: () => void;
  resetToRecord: () => void;
  switchToEnglish: () => void;
}

export function VoiceOrderConfirmation({
  extracted, transcript, showSpanishBeta,
  editBagSize, setEditBagSize,
  editServiceType, setEditServiceType,
  editDeliverySpeed, setEditDeliverySpeed,
  editPickupAddress, setEditPickupAddress,
  editPickupDate, setEditPickupDate,
  editPickupWindow, setEditPickupWindow,
  editNotes, setEditNotes,
  isMissing, handleContinue, resetToRecord, switchToEnglish,
}: VoiceOrderConfirmationProps) {
  return (
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
                onClick={switchToEnglish}
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
          onClick={resetToRecord}
          data-testid="button-retry-voice"
        >
          <Mic className="w-3.5 h-3.5 mr-1" />
          Record again
        </Button>
      </div>
    </>
  );
}
