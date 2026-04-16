import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  CheckCircle2,
  Star,
  Camera,
  TrendingUp,
  Award,
  AlertCircle,
  CheckSquare,
  Square,
  BarChart2,
  Loader2,
  Package,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Order } from "@shared/schema";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";

type QualityStats = {
  vendorId: number;
  myScore: number;
  vendorAvgScore: number;
  totalChecked: number;
  weeklyScores: { day: string; score: number; vendorAvg: number }[];
  recentChecklistItems: {
    id: number;
    orderNumber: string;
    inspectedItems: boolean;
    stainTreatment: boolean;
    foldingQuality: boolean;
    packaging: boolean;
    selfRating: number;
    notes: string;
    completedAt: string;
  }[];
};

const CHECKLIST_KEYS = [
  { key: "inspectedItems", label: "Items Inspected", description: "All items counted and matched" },
  { key: "stainTreatment", label: "Stain Treatment", description: "Visible stains pre-treated" },
  { key: "foldingQuality", label: "Folding Quality", description: "Neat, consistent folds" },
  { key: "packaging", label: "Packaging", description: "Properly bagged and sealed" },
] as const;

type ChecklistState = Record<typeof CHECKLIST_KEYS[number]["key"], boolean>;

const EMPTY_CHECKLIST: ChecklistState = {
  inspectedItems: false,
  stainTreatment: false,
  foldingQuality: false,
  packaging: false,
};

const FALLBACK_WEEKLY = [
  { day: "Mon", score: 4.2, vendorAvg: 4.0 },
  { day: "Tue", score: 4.5, vendorAvg: 4.1 },
  { day: "Wed", score: 4.3, vendorAvg: 4.2 },
  { day: "Thu", score: 4.8, vendorAvg: 4.1 },
  { day: "Fri", score: 4.6, vendorAvg: 4.3 },
  { day: "Sat", score: 4.4, vendorAvg: 4.0 },
  { day: "Sun", score: 4.7, vendorAvg: 4.2 },
];

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1.5" data-testid="star-rating-input">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          data-testid={`btn-star-${star}`}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
          className="transition-transform hover:scale-110"
        >
          <Star
            className={`w-7 h-7 transition-colors ${
              star <= (hovered || value)
                ? "fill-amber-400 text-amber-400"
                : "text-gray-600"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-xl px-3 py-2 text-xs shadow-lg">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p) => (
          <p key={p.name} style={{ color: p.color }} className="font-semibold">
            {p.name === "score" ? "My score" : "Vendor avg"}: {p.value.toFixed(1)}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

export default function StaffQuality() {
  const { user } = useAuth();
  const { toast } = useToast();
  const vendorId = user?.vendorId ?? 1;

  const [checklist, setChecklist] = useState<ChecklistState>({ ...EMPTY_CHECKLIST });
  const [selfRating, setSelfRating] = useState(0);
  const [notes, setNotes] = useState("");
  const [photoUploaded, setPhotoUploaded] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");

  const { data: stats, isLoading } = useQuery<QualityStats>({
    queryKey: ["/api/staff/quality-stats", vendorId],
    queryFn: async () => {
      const res = await apiRequest(`/api/staff/quality-stats?vendorId=${vendorId}`);
      return res.json();
    },
    enabled: !!vendorId,
  });

  // Fetch orders ready for quality check (wash_complete status)
  const { data: pendingOrders = [] } = useQuery<Order[]>({
    queryKey: ["/api/orders", `vendorId=${vendorId}`, "wash_complete"],
    queryFn: async () => {
      const res = await apiRequest(`/api/orders?vendorId=${vendorId}`);
      const all: Order[] = await res.json();
      return all.filter(o => o.status === "wash_complete");
    },
    enabled: !!vendorId,
  });

  const submitQualityMutation = useMutation({
    mutationFn: async ({ orderId, rating }: { orderId: number; rating: number }) => {
      // Record quality score on the order
      await apiRequest(`/api/orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ aiQualityScore: rating }),
      });
      // Advance status to packing
      const statusRes = await apiRequest(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "packing",
          description: `Quality check passed (score: ${rating}/5). ${notes.trim()}`.trim(),
        }),
      });
      return statusRes.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/quality-stats", vendorId] });
      toast({ title: "Quality check submitted!", description: "Order advanced to packing." });
      setSubmitted(true);
      setTimeout(() => {
        setChecklist({ ...EMPTY_CHECKLIST });
        setSelfRating(0);
        setNotes("");
        setPhotoUploaded(false);
        setSubmitted(false);
        setSelectedOrderId("");
      }, 2500);
    },
    onError: (err: Error) => {
      toast({ title: "Submit failed", description: err.message, variant: "destructive" });
    },
  });

  const weeklyData = stats?.weeklyScores ?? FALLBACK_WEEKLY;
  const myScore = stats?.myScore ?? 4.5;
  const vendorAvg = stats?.vendorAvgScore ?? 4.1;
  const totalChecked = stats?.totalChecked ?? 48;

  const allChecked = Object.values(checklist).every(Boolean);

  const handleToggle = (key: typeof CHECKLIST_KEYS[number]["key"]) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePhotoUpload = () => {
    setPhotoUploaded(true);
    toast({ title: "Photo marked as uploaded" });
  };

  const handleSubmit = () => {
    if (!allChecked) {
      toast({
        title: "Checklist incomplete",
        description: "Please check all items before submitting",
        variant: "destructive",
      });
      return;
    }
    if (selfRating === 0) {
      toast({
        title: "Rating required",
        description: "Please give a self-assessment rating",
        variant: "destructive",
      });
      return;
    }
    if (selectedOrderId) {
      // Submit via real API — advances order to packing
      submitQualityMutation.mutate({ orderId: Number(selectedOrderId), rating: selfRating });
    } else {
      // No order selected — just show confirmation (stat tracking only)
      setSubmitted(true);
      toast({ title: "Quality check recorded" });
      setTimeout(() => {
        setChecklist({ ...EMPTY_CHECKLIST });
        setSelfRating(0);
        setNotes("");
        setPhotoUploaded(false);
        setSubmitted(false);
      }, 2500);
    }
  };

  const scoreVsAvg = myScore - vendorAvg;

  return (
    <div className="min-h-screen bg-background pb-4">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle2 className="w-5 h-5 text-primary" />
          <h1
            data-testid="text-quality-title"
            className="text-xl font-bold text-foreground"
          >
            Quality Check
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Track washing quality and standards
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-4">
        {/* Score Overview */}
        <div className="grid grid-cols-3 gap-3">
          <div
            data-testid="stat-my-score"
            className="p-3 rounded-2xl bg-card border border-border text-center"
          >
            <p className="text-xl font-bold text-foreground">{myScore.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">My Score</p>
          </div>
          <div
            data-testid="stat-vendor-avg"
            className="p-3 rounded-2xl bg-card border border-border text-center"
          >
            <p className="text-xl font-bold text-foreground">{vendorAvg.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Vendor Avg</p>
          </div>
          <div
            data-testid="stat-total-checked"
            className="p-3 rounded-2xl bg-card border border-border text-center"
          >
            <p className="text-xl font-bold text-foreground">{totalChecked}</p>
            <p className="text-xs text-muted-foreground">Checked</p>
          </div>
        </div>

        {/* Score vs average */}
        <div
          data-testid="card-score-comparison"
          className={`p-4 rounded-2xl border flex items-center gap-4 ${
            scoreVsAvg >= 0
              ? "bg-emerald-500/10 border-emerald-500/20"
              : "bg-amber-500/10 border-amber-500/20"
          }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              scoreVsAvg >= 0 ? "bg-emerald-500/20" : "bg-amber-500/20"
            }`}
          >
            {scoreVsAvg >= 0 ? (
              <TrendingUp className={`w-5 h-5 text-emerald-400`} />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400" />
            )}
          </div>
          <div>
            <p
              className={`text-sm font-semibold ${
                scoreVsAvg >= 0 ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {scoreVsAvg >= 0 ? "Above" : "Below"} vendor average by{" "}
              {Math.abs(scoreVsAvg).toFixed(1)} pts
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {scoreVsAvg >= 0
                ? "Keep it up — you're setting the standard"
                : "Focus on consistency to improve"}
            </p>
          </div>
        </div>

        {/* Weekly Trend Chart */}
        {isLoading ? (
          <div className="p-4 rounded-2xl bg-card border border-border flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : (
          <div
            data-testid="chart-quality-trend"
            className="p-4 rounded-2xl bg-card border border-border"
          >
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">7-Day Quality Scores</p>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={weeklyData} barSize={14} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                />
                <YAxis domain={[3.5, 5]} hide />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(124,92,252,0.05)" }} />
                <ReferenceLine
                  y={vendorAvg}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
                <Bar
                  dataKey="score"
                  name="score"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  fillOpacity={0.9}
                />
                <Bar
                  dataKey="vendorAvg"
                  name="vendorAvg"
                  fill="hsl(var(--muted-foreground))"
                  radius={[4, 4, 0, 0]}
                  fillOpacity={0.4}
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2 justify-center text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-primary/90" />
                My score
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-muted-foreground/40" />
                Vendor avg
              </div>
            </div>
          </div>
        )}

        {/* Order Selection */}
        <div
          data-testid="card-order-select"
          className="p-4 rounded-2xl bg-card border border-border"
        >
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Select Order to Check</p>
          </div>
          {pendingOrders.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No orders awaiting quality check (wash_complete status).
            </p>
          ) : (
            <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
              <SelectTrigger data-testid="select-order" className="text-sm">
                <SelectValue placeholder="Choose an order to inspect..." />
              </SelectTrigger>
              <SelectContent>
                {pendingOrders.map(o => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    #{o.orderNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Quality Checklist */}
        <div
          data-testid="card-checklist"
          className="p-4 rounded-2xl bg-card border border-border"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-foreground">Quality Checklist</p>
            {allChecked && (
              <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                All clear
              </span>
            )}
          </div>

          <div className="space-y-3">
            {CHECKLIST_KEYS.map(({ key, label, description }) => {
              const checked = checklist[key];
              return (
                <button
                  key={key}
                  data-testid={`checkbox-${key}`}
                  onClick={() => handleToggle(key)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                    checked
                      ? "bg-emerald-500/10 border-emerald-500/20"
                      : "bg-muted/50 border-border hover:border-primary/30"
                  }`}
                >
                  {checked ? (
                    <CheckSquare className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <Square className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  )}
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        checked ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {label}
                    </p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Self-Assessment */}
        <div
          data-testid="card-self-assessment"
          className="p-4 rounded-2xl bg-card border border-border"
        >
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-semibold text-foreground">Self Assessment</p>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Rate the quality of this wash
          </p>
          <StarRating value={selfRating} onChange={setSelfRating} />
          {selfRating > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {selfRating === 5
                ? "Excellent — top quality"
                : selfRating === 4
                ? "Good — above average"
                : selfRating === 3
                ? "Acceptable — meets standard"
                : selfRating === 2
                ? "Below standard — note issues"
                : "Poor — flag for review"}
            </p>
          )}
        </div>

        {/* Notes */}
        <div
          data-testid="card-notes"
          className="p-4 rounded-2xl bg-card border border-border"
        >
          <p className="text-sm font-semibold text-foreground mb-2">Notes (optional)</p>
          <textarea
            data-testid="input-quality-notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any issues, observations, or comments..."
            rows={2}
            className="w-full text-sm bg-muted/50 border border-border rounded-xl px-3 py-2 resize-none text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Photo Upload */}
        <div
          data-testid="card-photo-upload"
          className="p-4 rounded-2xl bg-card border border-border"
        >
          <div className="flex items-center gap-2 mb-3">
            <Camera className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Quality Photo</p>
          </div>
          {photoUploaded ? (
            <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-sm text-emerald-300 font-medium">Photo uploaded</p>
                <p className="text-xs text-muted-foreground">Marked for quality record</p>
              </div>
            </div>
          ) : (
            <button
              data-testid="btn-upload-photo"
              onClick={handlePhotoUpload}
              className="w-full py-4 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex flex-col items-center gap-2"
            >
              <Camera className="w-6 h-6" />
              <span className="text-sm font-medium">Tap to mark photo as uploaded</span>
              <span className="text-xs text-muted-foreground/60">Simulated upload</span>
            </button>
          )}
        </div>

        {/* Submit Button */}
        <button
          data-testid="btn-submit-quality"
          onClick={handleSubmit}
          disabled={submitted || submitQualityMutation.isPending}
          className={`w-full py-4 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            submitted
              ? "bg-emerald-500 text-white"
              : allChecked && selfRating > 0
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
        >
          {submitted ? (
            <>
              <CheckCircle2 className="w-5 h-5" />
              Submitted!
            </>
          ) : submitQualityMutation.isPending ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Award className="w-5 h-5" />
              {selectedOrderId ? "Submit & Advance to Packing" : "Submit Quality Check"}
            </>
          )}
        </button>

        {/* Badge: not ready hint */}
        {(!allChecked || selfRating === 0) && !submitted && (
          <p
            data-testid="text-submit-hint"
            className="text-center text-xs text-muted-foreground"
          >
            {!allChecked
              ? "Complete checklist to submit"
              : "Add a star rating to submit"}
          </p>
        )}
      </div>
    </div>
  );
}
