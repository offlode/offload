/**
 * /checkout — Standalone checkout route
 *
 * The primary checkout flow is embedded inside the schedule/quote widget on the
 * home page. This route serves as a named landing point for deep-links and
 * redirects the customer into that flow so they never hit a 404.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

export default function CheckoutPage() {
  const [, navigate] = useLocation();

  // Redirect to the main scheduling/quote flow — that IS the checkout.
  // We use a short delay so the redirect is visible and doesn't feel broken.
  useEffect(() => {
    const t = setTimeout(() => navigate("/schedule"), 800);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6 max-w-lg mx-auto">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <Skeleton className="h-4 w-32 rounded" />
      <p className="text-sm text-muted-foreground">Taking you to checkout...</p>
    </div>
  );
}
