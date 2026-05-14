import { Shield, Search, BookOpen, BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/card";

const CERTIFIED_STEPS = [
  {
    icon: Search,
    title: "Application & Background Check",
    description: "Every vendor undergoes thorough background checks and identity verification before being considered.",
  },
  {
    icon: Shield,
    title: "Facility Inspection",
    description: "On-site inspections ensure equipment meets our standards for cleanliness, capacity, and safety.",
  },
  {
    icon: BookOpen,
    title: "Training & Testing",
    description: "Vendors complete our care training program covering fabric handling, stain treatment, and quality standards.",
  },
  {
    icon: BarChart3,
    title: "Performance Monitoring + Guarantee",
    description: "Continuous quality tracking and customer feedback loops ensure ongoing excellence. Our guarantee covers any issues.",
  },
];

export function CertifiedPanel() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-5 h-5 text-emerald-500" />
        <h3 className="text-sm font-bold">How Offload Certified Works</h3>
      </div>
      <div className="space-y-3">
        {CERTIFIED_STEPS.map((step, idx) => (
          <Card key={idx} className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                <step.icon className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-bold text-emerald-500">Step {idx + 1}</span>
                </div>
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
