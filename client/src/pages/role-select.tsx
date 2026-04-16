import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ShoppingBag, LayoutGrid, Navigation } from "lucide-react";

type Role = "customer" | "staff" | "driver";

const roles: { id: Role; label: string; description: string; icon: typeof ShoppingBag }[] = [
  {
    id: "customer",
    label: "Customer",
    description: "Order and track deliveries",
    icon: ShoppingBag,
  },
  {
    id: "staff",
    label: "Manager",
    description: "Manage orders and drivers",
    icon: LayoutGrid,
  },
  {
    id: "driver",
    label: "Driver",
    description: "Deliver orders and earn",
    icon: Navigation,
  },
];

export default function RoleSelectPage() {
  const [, navigate] = useLocation();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  const handleContinue = () => {
    if (!selectedRole) return;
    // Store role in sessionStorage-like approach via window — wouter hash routing
    // doesn't support query params in hash paths reliably
    (window as any).__offload_register_role = selectedRole;
    navigate("/register");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-6 pt-6 pb-8">
      <div className="w-full max-w-sm mx-auto flex flex-col flex-1">
        {/* Back button */}
        <button
          data-testid="button-back"
          type="button"
          onClick={() => navigate("/login")}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-card transition-colors -ml-2 mb-4"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>

        {/* Logo */}
        <h1
          data-testid="text-app-name"
          className="text-3xl font-extrabold text-white tracking-tight mb-3"
        >
          Offload
        </h1>

        {/* Heading */}
        <h2 className="text-xl font-bold text-foreground mb-1">Select Your Role</h2>
        <p className="text-sm text-muted-foreground mb-8">
          Choose how you want to use Offload
        </p>

        {/* Role Cards */}
        <div className="space-y-3">
          {roles.map((role) => {
            const Icon = role.icon;
            const isSelected = selectedRole === role.id;
            return (
              <button
                key={role.id}
                data-testid={`card-role-${role.id}`}
                type="button"
                onClick={() => setSelectedRole(role.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-muted-foreground/30"
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isSelected
                      ? "bg-primary"
                      : "bg-muted"
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 ${
                      isSelected ? "text-white" : "text-muted-foreground"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-semibold text-base ${
                      isSelected ? "text-foreground" : "text-foreground"
                    }`}
                  >
                    {role.label}
                  </p>
                  <p className="text-sm text-muted-foreground">{role.description}</p>
                </div>
                {/* Selection indicator */}
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    isSelected ? "border-primary" : "border-muted-foreground/40"
                  }`}
                >
                  {isSelected && (
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Continue Button */}
        <button
          data-testid="button-continue"
          type="button"
          onClick={handleContinue}
          disabled={!selectedRole}
          className="w-full h-[50px] mt-8 rounded-full bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
