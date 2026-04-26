import { useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      setSent(true);
    } catch (err: any) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#010101] p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-[#5B4BC4]/20 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-[#5B4BC4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Check your email</h1>
          <p className="text-[#999] text-sm leading-relaxed">
            If an account with <span className="text-white font-medium">{email}</span> exists, we've sent a password reset link. Check your inbox and spam folder.
          </p>
          <p className="text-[#666] text-xs">The link expires in 1 hour.</p>
          <Link href="/login">
            <a className="inline-block mt-4 text-[#5B4BC4] hover:text-[#5B4BC4]/80 text-sm font-medium transition-colors">
              &larr; Back to login
            </a>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#010101] p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white">Reset your password</h1>
          <p className="text-[#999] text-sm">Enter your email and we'll send you a reset link.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#ccc] mb-1.5">
              Email address
            </label>
            <input
              id="email"
              type="email"
              data-testid="input-email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="you@example.com"
              className={`w-full px-4 py-3 rounded-lg bg-[#1A1A1A] border text-white placeholder:text-[#666] focus:outline-none focus:ring-2 focus:ring-[#5B4BC4] transition-colors ${
                error ? "border-red-500" : "border-[#2E2E2E]"
              }`}
              autoFocus
            />
            {error && (
              <p className="mt-1.5 text-red-400 text-xs" data-testid="error-email">{error}</p>
            )}
          </div>

          <button
            type="submit"
            data-testid="button-submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-[#5B4BC4] hover:bg-[#4A3BA3] text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <div className="text-center">
          <Link href="/login">
            <a className="text-[#5B4BC4] hover:text-[#5B4BC4]/80 text-sm font-medium transition-colors">
              &larr; Back to login
            </a>
          </Link>
        </div>

      </div>
    </div>
  );
}
