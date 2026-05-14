import { ExternalLink, Phone, Mail, HelpCircle, Shield, Settings, MapPin, CreditCard } from "lucide-react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

const SUPPORT_EMAIL = "support@offloadusa.com";
const SUPPORT_PHONE = import.meta.env.VITE_SUPPORT_PHONE || "(800) 555-WASH";

const FAQ_ITEMS = [
  {
    q: "How does Offload work?",
    a: "Schedule a pickup, and our driver collects your laundry. It's washed by a certified vendor and delivered back fresh and folded — usually within 48 hours.",
  },
  {
    q: "What bag sizes are available?",
    a: "We offer Small (up to 10 lbs, $24.99), Medium (up to 20 lbs, $44.99), Large (up to 30 lbs, $59.99), and XL (up to 50 lbs, $89.99) bags. If your laundry goes slightly over, it's just $2.50 per additional pound.",
  },
  {
    q: "What is Offload Certified?",
    a: "Offload Certified is our quality guarantee program. Every vendor undergoes background checks, facility inspections, professional training, and ongoing performance monitoring. This ensures your clothes receive top-quality care every time.",
  },
  {
    q: "How long does delivery take?",
    a: "Standard delivery takes up to 48 hours (free). Next Day delivery is available for $5.99, and Same Day delivery for $12.99. Times may vary based on your location and vendor availability.",
  },
  {
    q: "Can I customize how my clothes are washed?",
    a: "Absolutely! Use our Customize Your Wash wizard to select bag sizes, separate by clothing type, choose specific wash preferences (detergent, folding style, temperature), and add special instructions.",
  },
  {
    q: "Can I cancel an order?",
    a: "Yes! You can cancel orders that are pending, confirmed, or have a driver assigned. Once the driver begins pickup, cancellation is no longer available. Go to Orders → select the order → Cancel.",
  },
  {
    q: "How do I file a dispute?",
    a: "After delivery, open the order details and tap 'File a Dispute'. Describe the issue (damaged items, missing pieces, quality concerns) and our team will review it within 24 hours.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit and debit cards (Visa, Mastercard, American Express, Discover). Payment is securely processed through Stripe.",
  },
  {
    q: "Is my laundry safe with Offload?",
    a: "Yes. All vendors are Offload Certified, meaning they've passed background checks and facility inspections. We track every bag from pickup to delivery, and our guarantee covers any issues.",
  },
  {
    q: "How does the loyalty program work?",
    a: "Earn points with every order. Points unlock tiers (Bronze, Silver, Gold, Platinum) with increasing benefits like free delivery, discounts, priority matching, and dedicated support.",
  },
  {
    q: "What areas do you serve?",
    a: "We currently serve select areas in the New York metro region. Enter your address during checkout to see if you're in our service area. If not, we'll add you to the waitlist.",
  },
  {
    q: "Can I schedule a recurring pickup?",
    a: "Currently orders are placed individually, but we're working on recurring scheduling. Save your preferences and addresses for faster reordering in the meantime.",
  },
  {
    q: "How do refunds work?",
    a: "Approved disputes result in partial or full refunds depending on the issue. Refunds are processed to your original payment method and typically arrive within 5-10 business days.",
  },
];

const QUICK_LINKS = [
  { label: "About Offload Certified", icon: Shield, href: "/profile" },
  { label: "Custom Wash Preferences", icon: Settings, href: "/profile" },
  { label: "Manage Addresses", icon: MapPin, href: "/addresses" },
  { label: "Payment Methods", icon: CreditCard, href: "/payments" },
];

export default function HelpPage() {
  return (
    <div className="pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <h1 className="text-xl font-bold" data-testid="text-help-title">Help & FAQ</h1>
        <p className="text-sm text-muted-foreground">Find answers or get in touch</p>
      </div>

      {/* Quick Links */}
      <div className="px-5 mb-6">
        <h3 className="text-sm font-semibold mb-3">Quick Links</h3>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_LINKS.map(link => (
            <Link key={link.label} href={link.href}>
              <Card className="p-3 cursor-pointer transition-all duration-200 hover:border-primary/30 active:scale-[0.98]">
                <link.icon className="w-4 h-4 text-primary mb-1.5" />
                <p className="text-xs font-medium">{link.label}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="px-5 mb-6">
        <h3 className="text-sm font-semibold mb-3">Frequently Asked Questions</h3>
        <Card className="px-4">
          <Accordion type="single" collapsible>
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-sm text-left" data-testid={`faq-${i}`}>
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      </div>

      {/* Contact section */}
      <div className="px-5">
        <h3 className="text-sm font-semibold mb-3">Still need help?</h3>
        <Card className="p-5 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <HelpCircle className="w-7 h-7 text-primary" />
          </div>
          <p className="text-sm font-semibold mb-1">Contact Support</p>
          <p className="text-xs text-muted-foreground mb-4">
            Our team is available to help with any issues. You'll reach a real person who can assist.
          </p>
          <div className="space-y-2">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="block">
              <Button className="w-full" data-testid="button-email-support">
                <Mail className="w-4 h-4 mr-2" />
                Email Support
              </Button>
            </a>
            <a href={`tel:${SUPPORT_PHONE.replace(/[^+\d]/g, "")}`} className="block">
              <Button variant="outline" className="w-full" data-testid="button-call-support">
                <Phone className="w-4 h-4 mr-2" />
                Call {SUPPORT_PHONE}
              </Button>
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
