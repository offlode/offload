import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { StarRating } from "./StarRating";

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overallRating: number;
  onOverallRatingChange: (v: number) => void;
  vendorRating: number;
  onVendorRatingChange: (v: number) => void;
  driverRating: number;
  onDriverRatingChange: (v: number) => void;
  reviewComment: string;
  onReviewCommentChange: (v: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  hasVendor: boolean;
  hasDriver: boolean;
}

export function ReviewDialog({
  open,
  onOpenChange,
  overallRating,
  onOverallRatingChange,
  vendorRating,
  onVendorRatingChange,
  driverRating,
  onDriverRatingChange,
  reviewComment,
  onReviewCommentChange,
  onSubmit,
  isPending,
  hasVendor,
  hasDriver,
}: ReviewDialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Leave a Review</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-5">
          <div>
            <Label className="text-sm font-semibold mb-2 block">Overall Experience</Label>
            <StarRating value={overallRating} onChange={onOverallRatingChange} />
          </div>
          {hasVendor && (
            <div>
              <Label className="text-sm font-semibold mb-2 block">Laundromat Quality</Label>
              <StarRating value={vendorRating} onChange={onVendorRatingChange} />
            </div>
          )}
          {hasDriver && (
            <div>
              <Label className="text-sm font-semibold mb-2 block">Driver Service</Label>
              <StarRating value={driverRating} onChange={onDriverRatingChange} />
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Comments (optional)</Label>
            <Textarea
              placeholder="Tell us about your experience..."
              value={reviewComment}
              onChange={e => onReviewCommentChange(e.target.value)}
              className="min-h-[80px]"
              data-testid="input-review-comment"
            />
          </div>
          <Button
            className="w-full"
            disabled={overallRating === 0 || isPending}
            onClick={onSubmit}
            data-testid="button-submit-review"
          >
            {isPending ? "Submitting..." : "Submit Review"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
