import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DisputeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string;
  onReasonChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export function DisputeDialog({
  open,
  onOpenChange,
  reason,
  onReasonChange,
  description,
  onDescriptionChange,
  onSubmit,
  isPending,
}: DisputeDialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>File a Dispute</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            We're sorry something went wrong. Please let us know what happened.
          </p>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Reason</Label>
            <Select value={reason} onValueChange={onReasonChange}>
              <SelectTrigger data-testid="select-dispute-reason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="damaged_items">Damaged Items</SelectItem>
                <SelectItem value="missing_items">Missing Items</SelectItem>
                <SelectItem value="wrong_items">Wrong Items</SelectItem>
                <SelectItem value="quality_issue">Quality Issue</SelectItem>
                <SelectItem value="overcharged">Overcharged</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Description</Label>
            <Textarea
              placeholder="Describe the issue in detail..."
              value={description}
              onChange={e => onDescriptionChange(e.target.value)}
              className="min-h-[100px]"
              data-testid="input-dispute-description"
            />
          </div>
          <Button
            className="w-full"
            disabled={!reason || !description.trim() || isPending}
            onClick={onSubmit}
            data-testid="button-submit-dispute"
          >
            {isPending ? "Submitting..." : "Submit Dispute"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
