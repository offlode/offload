import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle, Clock, CheckCircle2, XCircle, Scale,
  ShieldAlert, Package, DollarSign, FileText
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AdminLayout } from "./layout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Dispute, Order, User } from "@shared/schema";

const disputeStatusColors: Record<string, string> = {
  open: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  investigating: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  resolved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  closed: "bg-muted text-muted-foreground border-border",
};

const disputeStatusIcons: Record<string, React.ReactNode> = {
  open: <AlertTriangle className="w-3.5 h-3.5" />,
  investigating: <Scale className="w-3.5 h-3.5" />,
  resolved: <CheckCircle2 className="w-3.5 h-3.5" />,
  closed: <XCircle className="w-3.5 h-3.5" />,
};

function DisputeCard({ dispute, orders }: { dispute: Dispute; orders: Order[] }) {
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const { toast } = useToast();
  const order = orders.find(o => o.id === dispute.orderId);
  const statusColor = disputeStatusColors[dispute.status || ""] || "bg-muted";

  const { data: customer } = useQuery<User>({
    queryKey: ["/api/users", dispute.customerId],
    queryFn: async () => {
      const res = await apiRequest(`/api/users/${dispute.customerId}`);
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ status, resolution, credit }: { status: string; resolution?: string; credit?: number }) => {
      const body: any = {
        status,
        resolvedAt: new Date().toISOString(),
      };
      if (resolution) body.resolution = resolution;
      if (credit !== undefined && credit > 0) body.creditAmount = credit;
      const res = await apiRequest(`/api/disputes/${dispute.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/disputes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metrics"] });
      setResolutionNotes("");
      setCreditAmount("");
      toast({
        title: "Dispute updated",
        description: `Dispute #${dispute.id} marked as ${variables.status}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isActionable = dispute.status === "open" || dispute.status === "investigating";

  // Build a simple timeline
  const timeline: { label: string; time: string; icon: React.ReactNode }[] = [
    { label: "Dispute opened", time: dispute.createdAt || "", icon: <AlertTriangle className="w-3 h-3" /> },
  ];
  if (dispute.status === "investigating" || dispute.status === "resolved" || dispute.status === "closed") {
    timeline.push({ label: "Investigation started", time: "", icon: <Scale className="w-3 h-3" /> });
  }
  if (dispute.status === "resolved") {
    timeline.push({ label: "Resolved", time: dispute.resolvedAt || "", icon: <CheckCircle2 className="w-3 h-3 text-emerald-400" /> });
  }
  if (dispute.status === "closed") {
    timeline.push({ label: "Closed", time: dispute.resolvedAt || "", icon: <XCircle className="w-3 h-3" /> });
  }

  return (
    <Card className="p-4" data-testid={`admin-dispute-${dispute.id}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="w-[18px] h-[18px] text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-semibold">Dispute #{dispute.id}</p>
              <Badge variant="outline" className={`text-[10px] ${statusColor}`}>
                {disputeStatusIcons[dispute.status || ""]}
                <span className="ml-1">{dispute.status}</span>
              </Badge>
            </div>
            {customer && (
              <p className="text-xs text-muted-foreground">
                Customer: {customer.name} · {customer.email}
              </p>
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {dispute.createdAt ? new Date(dispute.createdAt).toLocaleDateString() : "—"}
        </p>
      </div>

      {/* Order info inline */}
      {order && (
        <div className="flex items-center gap-4 p-2.5 rounded-lg bg-muted/30 border border-border mb-3 text-xs">
          <div className="flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-primary" />
            <span className="font-medium">{order.orderNumber}</span>
          </div>
          <span className="text-muted-foreground">{order.pickupAddress}</span>
          <span className="font-semibold ml-auto">${order.total?.toFixed(2)}</span>
        </div>
      )}

      {/* Reason + description */}
      <div className="mb-3">
        <Badge variant="secondary" className="text-[10px] mb-2 capitalize">
          {(dispute.reason || "general").replace(/_/g, " ")}
        </Badge>
        {dispute.description && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {dispute.description}
          </p>
        )}
      </div>

      {/* Timeline */}
      <div className="mb-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Timeline</p>
        <div className="space-y-1.5">
          {timeline.map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
                {step.icon}
              </div>
              <span className="font-medium">{step.label}</span>
              {step.time && (
                <span className="text-muted-foreground">
                  · {new Date(step.time).toLocaleDateString()}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Existing resolution */}
      {dispute.resolution && (
        <div className="text-xs bg-muted/50 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-1.5 mb-1">
            <FileText className="w-3 h-3 text-emerald-400" />
            <p className="font-semibold text-emerald-400">Resolution</p>
          </div>
          <p className="text-muted-foreground">{dispute.resolution}</p>
          {dispute.creditAmount != null && dispute.creditAmount > 0 && (
            <div className="flex items-center gap-1 mt-1.5 text-emerald-400">
              <DollarSign className="w-3 h-3" />
              <span className="font-semibold">${dispute.creditAmount.toFixed(2)} credit issued</span>
            </div>
          )}
        </div>
      )}

      {/* Action area */}
      {isActionable && (
        <div className="space-y-3 pt-2 border-t border-border">
          <div>
            <Label className="text-xs">Resolution Notes</Label>
            <Textarea
              value={resolutionNotes}
              onChange={e => setResolutionNotes(e.target.value)}
              placeholder="Describe the resolution or reason for closing..."
              className="mt-1 min-h-[60px] text-xs"
              data-testid={`input-resolution-${dispute.id}`}
            />
          </div>
          <div className="w-40">
            <Label className="text-xs">Credit Amount ($)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={creditAmount}
              onChange={e => setCreditAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1"
              data-testid={`input-credit-${dispute.id}`}
            />
          </div>
          <div className="flex items-center gap-2">
            {dispute.status === "open" && (
              <Button
                size="sm"
                variant="secondary"
                className="text-xs h-7"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ status: "investigating" })}
                data-testid={`action-investigate-${dispute.id}`}
              >
                <Scale className="w-3 h-3 mr-1" /> Begin Investigation
              </Button>
            )}
            <Button
              size="sm"
              className="text-xs h-7"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate({
                status: "resolved",
                resolution: resolutionNotes || "Issue resolved by admin — credit applied to customer account.",
                credit: parseFloat(creditAmount) || 0,
              })}
              data-testid={`action-resolve-${dispute.id}`}
            >
              <CheckCircle2 className="w-3 h-3 mr-1" /> Resolve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="text-xs h-7"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate({
                status: "closed",
                resolution: resolutionNotes || "Dispute closed after review — no evidence of vendor fault.",
              })}
              data-testid={`action-close-${dispute.id}`}
            >
              <XCircle className="w-3 h-3 mr-1" /> Close
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function AdminDisputes() {
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: disputes, isLoading } = useQuery<Dispute[]>({
    queryKey: ["/api/disputes"],
  });
  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  const filtered = (disputes || []).filter(d => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    return true;
  });

  const openCount = (disputes || []).filter(d => d.status === "open").length;
  const investigatingCount = (disputes || []).filter(d => d.status === "investigating").length;

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-admin-disputes">Dispute Resolution</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review and resolve customer complaints and order disputes
          </p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{openCount}</p>
              <p className="text-[10px] text-muted-foreground">Open</p>
            </div>
          </Card>
          <Card className="p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Scale className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{investigatingCount}</p>
              <p className="text-[10px] text-muted-foreground">Investigating</p>
            </div>
          </Card>
          <Card className="p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <ShieldAlert className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-bold">{(disputes || []).length}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
          </Card>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48 h-9" data-testid="select-dispute-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Disputes</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Disputes List */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="space-y-3">
            {filtered.map(dispute => (
              <DisputeCard key={dispute.id} dispute={dispute} orders={orders} />
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-sm font-medium">
              {statusFilter !== "all" ? "No disputes match this filter" : "No disputes"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {statusFilter !== "all"
                ? "Try changing the status filter"
                : "All clear — no customer complaints or disputes"
              }
            </p>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
