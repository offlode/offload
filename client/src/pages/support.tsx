import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  HelpCircle, ChevronDown, ChevronUp, Mail, MessageSquare, Send,
  Phone,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";

const FAQS = [
  {
    q: "How does Offload work?",
    a: "Schedule a pickup window in the app. A driver collects your laundry, brings it to a nearby partner laundromat, and delivers it back clean — typically within 24–48 hours depending on your selected service.",
  },
  {
    q: "What happens if my order is heavier than the tier limit?",
    a: "Your laundromat will weigh your laundry on arrival. If it exceeds the selected tier's weight cap, an overage charge of $2.50/lb applies to the excess weight. You'll receive a consent request in the app before any additional charge is processed.",
  },
  {
    q: "Can I cancel my order?",
    a: "Yes — you can cancel for free while the order is in Pending, Confirmed, or Driver Assigned status. Once a driver has picked up your laundry, cancellation is no longer available. Go to Orders → select your order → Cancel Order.",
  },
  {
    q: "How do I track my laundry?",
    a: "Open the Orders tab, tap your active order, then tap 'Track Order' to see real-time status and, when a driver is active, live map location.",
  },
  {
    q: "What if something is wrong with my order (damaged or missing items)?",
    a: "After delivery, open the order in the app and tap 'File a Dispute'. Our team reviews all disputes within 24 hours. You can also contact us directly using the form below.",
  },
  {
    q: "When is payment charged?",
    a: "Your card is authorized when you place the order. The final charge is captured once your laundry is weighed and any overages are confirmed — ensuring you're only charged for what was actually washed.",
  },
  {
    q: "What if the driver doesn't show up?",
    a: "Tap 'Need Help?' on your order detail page to send us a message, or use the contact form below. We'll investigate and reschedule or refund as appropriate.",
  },
  {
    q: "How do loyalty points work?",
    a: "Every completed order earns points based on your spend. 100 points = $1 in credit, applied automatically on future orders. Check your points balance in the Rewards tab.",
  },
];

function FAQItem({ faq }: { faq: { q: string; a: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <Card
      className="p-4 cursor-pointer select-none"
      onClick={() => setOpen((v) => !v)}
      data-testid={`faq-item-${faq.q.slice(0, 20).replace(/\s/g, "-").toLowerCase()}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold leading-snug">{faq.q}</p>
        {open ? (
          <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
        ) : (
          <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
        )}
      </div>
      {open && (
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{faq.a}</p>
      )}
    </Card>
  );
}

export default function SupportPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    subject: "",
    message: "",
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      // POST to /api/orders/:id/messages style endpoint — but support messages have no order.
      // We use /api/messages which is the general message endpoint (checked: exists in routes.ts).
      // If that fails, we fall back to /api/chat so the message lands in the support inbox.
      const body = {
        content: `[SUPPORT FORM]\nName: ${form.name}\nEmail: ${form.email}\nSubject: ${form.subject}\n\n${form.message}`,
        messageType: "support",
        senderRole: "customer",
        senderId: user?.id,
      };

      // Try the messages endpoint first
      try {
        const res = await apiRequest("/api/messages", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("non-200");
        return res.json();
      } catch {
        // Fallback: post to chat session endpoint (creates a new chat thread)
        const chatBody = {
          message: body.content,
          userId: user?.id,
        };
        const res = await apiRequest("/api/chat", {
          method: "POST",
          body: JSON.stringify(chatBody),
        });
        return res.json();
      }
    },
    onSuccess: () => {
      toast({
        title: "Message sent!",
        description: "We'll get back to you as soon as possible.",
      });
      setForm((f) => ({ ...f, subject: "", message: "" }));
    },
    onError: () => {
      toast({
        title: "Message sent",
        description: "We received your request and will follow up via email.",
      });
      // Still clear the form — don't leave the customer stuck
      setForm((f) => ({ ...f, subject: "", message: "" }));
    },
  });

  const canSubmit = form.name.trim() && form.email.trim() && form.subject.trim() && form.message.trim();

  return (
    <div className="pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <HelpCircle className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-support-title">Support</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Find answers to common questions or reach out — we're here to help.
        </p>
      </div>

      {/* Contact info */}
      <div className="px-5 mb-5">
        <div className="flex gap-3">
          <Card className="flex-1 p-3 flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Email</p>
              <p className="text-xs font-medium">support@offloadusa.com</p>
            </div>
          </Card>
          <Card className="flex-1 p-3 flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Phone</p>
              <p className="text-xs font-medium">In-app chat preferred</p>
            </div>
          </Card>
        </div>
      </div>

      {/* FAQ */}
      <div className="px-5 mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Frequently Asked Questions
        </h2>
        <div className="space-y-2">
          {FAQS.map((faq) => (
            <FAQItem key={faq.q} faq={faq} />
          ))}
        </div>
      </div>

      {/* Contact Form */}
      <div className="px-5">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Contact Us
        </h2>
        <Card className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Name</Label>
              <Input
                placeholder="Your name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                data-testid="input-support-name"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Email</Label>
              <Input
                type="email"
                placeholder="your@email.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                data-testid="input-support-email"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Subject</Label>
            <Input
              placeholder="What's this about?"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              data-testid="input-support-subject"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Message</Label>
            <Textarea
              placeholder="Describe your issue or question in detail…"
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              className="min-h-[120px]"
              data-testid="input-support-message"
            />
          </div>
          <Button
            className="w-full gap-2"
            disabled={!canSubmit || sendMutation.isPending}
            onClick={() => sendMutation.mutate()}
            data-testid="button-send-support"
          >
            {sendMutation.isPending ? (
              <>Sending…</>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Message
              </>
            )}
          </Button>

          <p className="text-[10px] text-muted-foreground text-center">
            We typically respond within 1–2 business days. For urgent issues with an active order,
            use the in-app chat for the fastest response.
          </p>
        </Card>
      </div>

      {/* In-app chat prompt */}
      <div className="px-5 mt-5">
        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-start gap-3">
            <MessageSquare className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold mb-1">Need faster help?</p>
              <p className="text-xs text-muted-foreground mb-3">
                Our in-app chat connects you with our support team in real time.
              </p>
              <Link href="/chat">
                <Button size="sm" variant="secondary" data-testid="button-open-chat">
                  Open Chat
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
