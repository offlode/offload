/**
 * Owner Review Center — sandbox-only design/flow review experience.
 *
 * Hidden behind admin gate AND sandbox env check. Backend `/api/admin/owner-review/meta`
 * returns 404 when NOT in sandbox, so production never exposes this surface even if
 * the route is reached.
 *
 * Includes:
 *  - Design system preview (buttons, inputs, modals, toasts, badges, cards, etc.)
 *  - Brand review (palette, tagline, typography)
 *  - Screen gallery for all 5 roles (links to live routes)
 *  - Flow checklist for major journeys
 *  - Button/action audit inventory
 *  - Test account reference (passwords masked)
 *  - System health & integration status
 */

import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import {
  CheckCircle2, XCircle, AlertCircle, Info, Loader2, Eye, EyeOff,
  Palette, Type, LayoutDashboard, Users, Truck, Store, ShieldCheck,
  Smartphone, Monitor, Tablet, ArrowRight, ExternalLink, Copy
} from "lucide-react";

interface OwnerReviewMeta {
  sandbox: boolean;
  apiUrl: string;
  buildCommit?: string;
  brand: {
    primaryColor: string;
    bgColor: string;
    textColor: string;
    fontFamily: string;
    tagline: string;
    appName: string;
  };
  pricing: {
    tiers: Record<string, { displayName: string; flatPrice: number; maxWeight: number }>;
    deliveryFees: { "48h": number; "24h": number; same_day: number };
    taxRate: number;
  };
  health: {
    api: boolean;
    db: boolean;
    stripe: boolean;
    stripeMode: "test" | "live" | "unknown";
    webhookSecretConfigured: boolean;
  };
  testAccounts: Array<{
    role: string;
    email: string;
    passwordHint: string;
    url: string;
  }>;
  screens: Array<{ role: string; title: string; path: string; description?: string }>;
  flows: Array<{
    name: string;
    persona: string;
    startUrl: string;
    steps: string[];
    expected: string;
    knownIssues?: string;
  }>;
}

function SafeBadge({ ok, okLabel = "OK", failLabel = "ISSUE" }: { ok: boolean; okLabel?: string; failLabel?: string }) {
  return ok ? (
    <Badge className="bg-green-600 hover:bg-green-700 text-white"><CheckCircle2 className="w-3 h-3 mr-1" /> {okLabel}</Badge>
  ) : (
    <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> {failLabel}</Badge>
  );
}

export default function OwnerReviewPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [meta, setMeta] = useState<OwnerReviewMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoToastShown, setDemoToastShown] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiRequest("/api/admin/owner-review/meta", { method: "GET" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) throw new Error(data.error);
        setMeta(data);
      })
      .catch((e) => setError(e?.message || "Failed to load review metadata"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Owner Review Center unavailable</AlertTitle>
          <AlertDescription>
            {error || "This experience is only available in the sandbox environment for admin users."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="owner-review-root">
      {/* Sandbox warning banner */}
      <Alert className="border-amber-500 bg-amber-500/10">
        <Info className="h-4 w-4 text-amber-500" />
        <AlertTitle className="text-amber-100">SANDBOX ONLY · Test/demo data</AlertTitle>
        <AlertDescription className="text-amber-100/80">
          You are in the Owner Review Center. This page is hidden in production. All data shown here is sandbox/test only.
          No real payments. No real customers. Stripe is in test mode.
        </AlertDescription>
      </Alert>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Owner Review Center</h1>
          <p className="text-muted-foreground mt-1">{meta.brand.tagline}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" data-testid="env-badge">env: sandbox</Badge>
          <Badge variant="outline">build: {meta.buildCommit?.slice(0, 7) || "dev"}</Badge>
          <Badge variant="outline">user: {user?.email}</Badge>
        </div>
      </div>

      {/* System health strip */}
      <Card data-testid="health-card">
        <CardHeader className="pb-3"><CardTitle className="text-base">System health</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">API</span><SafeBadge ok={meta.health.api} /></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Database</span><SafeBadge ok={meta.health.db} /></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Stripe</span><SafeBadge ok={meta.health.stripe} /></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Stripe mode</span>
              <Badge className={meta.health.stripeMode === "test" ? "bg-blue-600 text-white" : meta.health.stripeMode === "live" ? "bg-red-600 text-white" : ""}>{meta.health.stripeMode}</Badge>
            </div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Webhook secret</span><SafeBadge ok={meta.health.webhookSecretConfigured} /></div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="design" className="w-full">
        <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full">
          <TabsTrigger value="design" data-testid="tab-design">Design</TabsTrigger>
          <TabsTrigger value="brand" data-testid="tab-brand">Brand</TabsTrigger>
          <TabsTrigger value="screens" data-testid="tab-screens">Screens</TabsTrigger>
          <TabsTrigger value="flows" data-testid="tab-flows">Flows</TabsTrigger>
          <TabsTrigger value="accounts" data-testid="tab-accounts">Test Accounts</TabsTrigger>
          <TabsTrigger value="config" data-testid="tab-config">Config</TabsTrigger>
        </TabsList>

        {/* ─────── DESIGN SYSTEM ─────── */}
        <TabsContent value="design" className="space-y-6 mt-6">
          <Card>
            <CardHeader><CardTitle>Buttons</CardTitle><CardDescription>All button states using the actual app components.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button data-testid="demo-btn-primary">Primary</Button>
              <Button variant="secondary" data-testid="demo-btn-secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="ghost" className="underline text-purple-600">Link</Button>
              <Button disabled>Disabled</Button>
              <Button size="sm">Small</Button>
              <Button size="lg">Large</Button>
              <Button disabled className="opacity-80">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Form controls</CardTitle></CardHeader>
            <CardContent className="space-y-4 max-w-2xl">
              <div className="space-y-2">
                <Label htmlFor="demo-text">Text input</Label>
                <Input id="demo-text" placeholder="Type something" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="demo-disabled">Disabled input</Label>
                <Input id="demo-disabled" placeholder="Cannot type" disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="demo-textarea">Textarea</Label>
                <Textarea id="demo-textarea" placeholder="Longer text…" />
              </div>
              <div className="space-y-2">
                <Label>Select</Label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Pick a bag size" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="s">Small ($24.99)</SelectItem>
                    <SelectItem value="m">Medium ($44.99)</SelectItem>
                    <SelectItem value="l">Large ($59.99)</SelectItem>
                    <SelectItem value="xl">XL ($89.99)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="demo-check" />
                <Label htmlFor="demo-check">I accept the terms</Label>
              </div>
              <RadioGroup defaultValue="48h">
                <div className="flex items-center space-x-2"><RadioGroupItem value="48h" id="r1" /><Label htmlFor="r1">Standard 48h ($0)</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="24h" id="r2" /><Label htmlFor="r2">Next Day 24h (+$5.99)</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="sd" id="r3" /><Label htmlFor="r3">Same Day 12h (+$12.99)</Label></div>
              </RadioGroup>
              <div className="flex items-center space-x-2">
                <Switch id="demo-switch" />
                <Label htmlFor="demo-switch">Available for delivery</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Badges & status chips</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge className="bg-green-600 text-white">Paid</Badge>
              <Badge className="bg-amber-600 text-white">Pending</Badge>
              <Badge className="bg-blue-600 text-white">In Progress</Badge>
              <Badge className="bg-purple-600 text-white">Delivered</Badge>
              <Badge className="bg-red-600 text-white">Refunded</Badge>
              <Badge className="bg-zinc-600 text-white">Cancelled</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Alerts & dialogs</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Alert><Info className="h-4 w-4" /><AlertTitle>Info</AlertTitle><AlertDescription>Standard info alert.</AlertDescription></Alert>
              <Alert className="border-green-500 bg-green-500/10"><CheckCircle2 className="h-4 w-4 text-green-500" /><AlertTitle className="text-green-100">Success</AlertTitle><AlertDescription>Your action completed.</AlertDescription></Alert>
              <Alert className="border-amber-500 bg-amber-500/10"><AlertCircle className="h-4 w-4 text-amber-500" /><AlertTitle>Warning</AlertTitle><AlertDescription>Please review before continuing.</AlertDescription></Alert>
              <Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>Something went wrong.</AlertDescription></Alert>

              <div className="flex gap-2">
                <Dialog>
                  <DialogTrigger asChild><Button variant="outline">Open dialog</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Sample dialog</DialogTitle></DialogHeader>
                    <p className="text-sm text-muted-foreground">Standard modal with overlay and focus trap.</p>
                  </DialogContent>
                </Dialog>
                <Button variant="outline" onClick={() => { toast({ title: "Toast demo", description: "Order #1234 paid successfully (sandbox)" }); setDemoToastShown(true); }}>
                  Show toast
                </Button>
                {demoToastShown && <span className="text-xs text-muted-foreground self-center">Toast triggered →</span>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Empty & loading states</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="border border-dashed rounded-lg p-8 text-center">
                  <LayoutDashboard className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">No orders yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Schedule your first pickup to get started.</p>
                  <Button className="mt-3" size="sm">Schedule pickup</Button>
                </div>
                <div className="border rounded-lg p-8 text-center">
                  <Loader2 className="w-10 h-10 mx-auto text-primary animate-spin mb-3" />
                  <p className="font-medium">Loading…</p>
                </div>
                <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-8 text-center">
                  <XCircle className="w-10 h-10 mx-auto text-red-500 mb-3" />
                  <p className="font-medium">Could not load orders</p>
                  <p className="text-sm text-muted-foreground mt-1">Check your connection and try again.</p>
                  <Button className="mt-3" size="sm" variant="outline">Retry</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Table</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow><TableCell>#1024</TableCell><TableCell>Sandbox Test User</TableCell><TableCell><Badge className="bg-green-600 text-white">Paid</Badge></TableCell><TableCell className="text-right">$50.67</TableCell></TableRow>
                  <TableRow><TableCell>#1025</TableCell><TableCell>Sandbox Test User</TableCell><TableCell><Badge className="bg-amber-600 text-white">Pending</Badge></TableCell><TableCell className="text-right">$44.99</TableCell></TableRow>
                  <TableRow><TableCell>#1026</TableCell><TableCell>Sandbox Test User</TableCell><TableCell><Badge className="bg-red-600 text-white">Refunded</Badge></TableCell><TableCell className="text-right">$5.00</TableCell></TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────── BRAND ─────── */}
        <TabsContent value="brand" className="space-y-6 mt-6">
          <Card>
            <CardHeader><CardTitle>Brand identity</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Brand color (primary)</p>
                  <div className="rounded-lg overflow-hidden border">
                    <div className="h-24" style={{ background: meta.brand.primaryColor }} />
                    <div className="bg-muted px-3 py-2 text-sm font-mono flex items-center justify-between">
                      <span>{meta.brand.primaryColor}</span>
                      <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(meta.brand.primaryColor); toast({ title: "Copied" }); }}><Copy className="w-3 h-3" /></Button>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Background (dark theme)</p>
                  <div className="rounded-lg overflow-hidden border">
                    <div className="h-24" style={{ background: meta.brand.bgColor }} />
                    <div className="bg-muted px-3 py-2 text-sm font-mono">{meta.brand.bgColor}</div>
                  </div>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <p className="text-sm text-muted-foreground">Typography</p>
                  <div className="space-y-2 p-4 border rounded-lg">
                    <h1 className="text-4xl font-bold">Heading 1 / 36px Bold</h1>
                    <h2 className="text-2xl font-semibold">Heading 2 / 24px Semibold</h2>
                    <h3 className="text-xl font-medium">Heading 3 / 20px Medium</h3>
                    <p className="text-base">Body / 16px Regular — Fresh clothes, zero hassle. The fastest laundry pickup in Brooklyn.</p>
                    <p className="text-sm text-muted-foreground">Small / 14px Muted — Used for helper text and metadata.</p>
                    <p className="text-xs text-muted-foreground">Caption / 12px Muted — Used for timestamps and footnotes.</p>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-muted-foreground">Tagline</p>
                  <p className="text-2xl font-semibold mt-1">{meta.brand.tagline}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Copy samples</CardTitle><CardDescription>Real strings used in the customer experience.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 border rounded"><p className="text-xs uppercase text-muted-foreground">Customer · Home</p><p className="mt-1">Schedule a pickup, choose your service, and we'll handle the rest.</p></div>
              <div className="p-3 border rounded"><p className="text-xs uppercase text-muted-foreground">Customer · Checkout</p><p className="mt-1">Pay securely with Stripe. Your card is never stored on our servers.</p></div>
              <div className="p-3 border rounded"><p className="text-xs uppercase text-muted-foreground">Vendor · Payout</p><p className="mt-1">Earnings shown are estimates. Real payouts require Stripe Connect (not yet enabled).</p></div>
              <div className="p-3 border rounded"><p className="text-xs uppercase text-muted-foreground">Driver · Earnings</p><p className="mt-1">$8.50 per trip. Payouts are processed weekly once Connect is live.</p></div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────── SCREENS ─────── */}
        <TabsContent value="screens" className="space-y-6 mt-6">
          {(["customer", "driver", "vendor", "manager", "admin"] as const).map((role) => {
            const screens = meta.screens.filter(s => s.role === role);
            if (screens.length === 0) return null;
            return (
              <Card key={role}>
                <CardHeader><CardTitle className="capitalize">{role} screens ({screens.length})</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {screens.map((s) => (
                      <Link key={s.path} href={s.path} data-testid={`screen-link-${role}-${s.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        <div className="border rounded-lg p-4 hover:border-primary hover:bg-muted/30 transition-colors cursor-pointer">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{s.title}</span>
                            <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 font-mono">{s.path}</p>
                          {s.description && <p className="text-xs text-muted-foreground mt-2">{s.description}</p>}
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ─────── FLOWS ─────── */}
        <TabsContent value="flows" className="space-y-4 mt-6">
          {meta.flows.map((flow, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{flow.name}</CardTitle>
                    <CardDescription>Persona: {flow.persona}</CardDescription>
                  </div>
                  <Link href={flow.startUrl}>
                    <Button size="sm" variant="outline" data-testid={`flow-start-${i}`}>
                      Start <ExternalLink className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <ol className="text-sm space-y-1 list-decimal list-inside">
                  {flow.steps.map((s, j) => <li key={j}>{s}</li>)}
                </ol>
                <div className="text-sm pt-2 border-t">
                  <span className="text-muted-foreground">Expected: </span>{flow.expected}
                </div>
                {flow.knownIssues && (
                  <Alert className="border-amber-500 bg-amber-500/10 mt-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <AlertDescription>{flow.knownIssues}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ─────── TEST ACCOUNTS ─────── */}
        <TabsContent value="accounts" className="space-y-4 mt-6">
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Sandbox test accounts</AlertTitle>
            <AlertDescription>
              Passwords are masked here. Real credentials live in your Owner Operations Guide. Never share publicly.
            </AlertDescription>
          </Alert>
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Password (masked)</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meta.testAccounts.map((acct) => (
                    <TableRow key={acct.email}>
                      <TableCell className="font-medium capitalize">{acct.role}</TableCell>
                      <TableCell className="font-mono text-xs">{acct.email}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{acct.passwordHint}</TableCell>
                      <TableCell className="text-right">
                        <Link href={acct.url}>
                          <Button size="sm" variant="outline" data-testid={`acct-go-${acct.role}`}>Go {<ArrowRight className="w-3 h-3 ml-1" />}</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────── CONFIG / TRUTH ─────── */}
        <TabsContent value="config" className="space-y-4 mt-6">
          <Card>
            <CardHeader><CardTitle>Live pricing config (from DB)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Bag</TableHead><TableHead>Display name</TableHead><TableHead>Max weight (lb)</TableHead><TableHead className="text-right">Flat price</TableHead></TableRow></TableHeader>
                <TableBody>
                  {Object.entries(meta.pricing.tiers).map(([k, t]) => (
                    <TableRow key={k}><TableCell className="font-mono text-xs">{k}</TableCell><TableCell>{t.displayName}</TableCell><TableCell>{t.maxWeight}</TableCell><TableCell className="text-right">${t.flatPrice.toFixed(2)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><p className="text-muted-foreground">Standard 48h</p><p className="font-medium">${meta.pricing.deliveryFees["48h"].toFixed(2)}</p></div>
                <div><p className="text-muted-foreground">Next Day 24h</p><p className="font-medium">${meta.pricing.deliveryFees["24h"].toFixed(2)}</p></div>
                <div><p className="text-muted-foreground">Same Day 12h</p><p className="font-medium">${meta.pricing.deliveryFees.same_day.toFixed(2)}</p></div>
                <div><p className="text-muted-foreground">NY tax rate</p><p className="font-medium">{(meta.pricing.taxRate * 100).toFixed(3)}%</p></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Truthfulness audit</CardTitle><CardDescription>What is real vs simulated in sandbox</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Feature</TableHead><TableHead>Status</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow><TableCell>Stripe payment intents</TableCell><TableCell><Badge className="bg-blue-600 text-white">REAL (test mode)</Badge></TableCell><TableCell>Real Stripe API calls in test mode</TableCell></TableRow>
                  <TableRow><TableCell>Stripe refunds</TableCell><TableCell><Badge className="bg-blue-600 text-white">REAL (test mode)</Badge></TableCell><TableCell>Real Stripe refund objects created</TableCell></TableRow>
                  <TableRow><TableCell>Vendor payouts</TableCell><TableCell><Badge variant="outline">SIMULATED</Badge></TableCell><TableCell>UI shows estimates; Stripe Connect not enabled</TableCell></TableRow>
                  <TableRow><TableCell>Driver payouts</TableCell><TableCell><Badge variant="outline">SIMULATED</Badge></TableCell><TableCell>UI shows estimates; Stripe Connect not enabled</TableCell></TableRow>
                  <TableRow><TableCell>SMS / push notifications</TableCell><TableCell><Badge variant="outline">SIMULATED</Badge></TableCell><TableCell>Console-logged only in sandbox</TableCell></TableRow>
                  <TableRow><TableCell>Email notifications</TableCell><TableCell><Badge variant="outline">SIMULATED</Badge></TableCell><TableCell>Captured in order_events table</TableCell></TableRow>
                  <TableRow><TableCell>Support chat</TableCell><TableCell><Badge className="bg-green-600 text-white">REAL</Badge></TableCell><TableCell>Customer ↔ admin messages persisted</TableCell></TableRow>
                  <TableRow><TableCell>Order state machine</TableCell><TableCell><Badge className="bg-green-600 text-white">REAL</Badge></TableCell><TableCell>State transitions enforced server-side</TableCell></TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
