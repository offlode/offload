import { Link } from "wouter";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-5 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Home className="w-8 h-8 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-bold mb-2">Page Not Found</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-[280px]">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link href="/">
        <Button>Back to Home</Button>
      </Link>
    </div>
  );
}
