"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchOnboardLinks, sendOnboardEmail, type OnboardLinkItem } from "@/lib/api";
import { getSession, type StoredSession } from "@/lib/session";
import { ShieldMark } from "@/components/shield-mark";
import { MaterialIcon } from "@/components/stitch/material-icon";
import { Loader2 } from "lucide-react";

export default function AdminPage() {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [email, setEmail] = useState("");
  const [companyHint, setCompanyHint] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<OnboardLinkItem[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(true);

  useEffect(() => {
    setSession(getSession());
    const onAuth = () => setSession(getSession());
    window.addEventListener("sentinel-auth", onAuth);
    return () => window.removeEventListener("sentinel-auth", onAuth);
  }, []);

  const loadLinks = useCallback(() => {
    setLoadingLinks(true);
    fetchOnboardLinks()
      .then(setLinks)
      .catch(() => {})
      .finally(() => setLoadingLinks(false));
  }, []);

  useEffect(() => {
    if (session?.user?.role === "admin") loadLinks();
    else setLoadingLinks(false);
  }, [session, loadLinks]);

  const handleSend = async () => {
    const em = email.trim();
    if (!em || sending) return;
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await sendOnboardEmail(em, companyHint.trim());
      setSuccess(res.message);
      setEmail("");
      setCompanyHint("");
      loadLinks();
      setTimeout(() => setSuccess(null), 5000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  if (!session) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-8 text-center">
          <p className="font-mono text-sm text-on-surface-variant">Sign in to access the admin panel.</p>
          <Link
            href="/login"
            className="mt-6 inline-flex rounded border border-secondary-container/40 bg-secondary-container/10 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-secondary-fixed hover:bg-secondary-container/20"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (session.user.role !== "admin") {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-8 text-center">
          <MaterialIcon name="shield" className="mx-auto mb-3 text-4xl text-error" />
          <p className="font-mono text-sm text-on-surface-variant">Admin access only.</p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded border border-outline-variant/25 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-white hover:border-secondary-container/40 hover:text-secondary-fixed"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 pb-10 pt-4 md:px-6">
      <header className="border-b border-outline-variant/10 pb-6">
        <div className="flex items-center gap-3">
          <ShieldMark size={28} className="text-secondary-fixed" />
          <div>
            <h1 className="font-headline text-2xl font-black uppercase tracking-tighter text-white">
              Sentinel Admin
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-widest text-outline">
              Company Onboarding
            </p>
          </div>
        </div>
      </header>

      {/* Send onboard email */}
      <section className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-6">
        <h2 className="mb-1 font-headline text-lg font-bold text-white">Send Onboard Link</h2>
        <p className="mb-4 font-mono text-xs text-on-surface-variant">
          Type the customer&apos;s email and click Send. They&apos;ll get an email with a link to create their company account.
        </p>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="group relative flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                <MaterialIcon name="email" className="text-lg" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSend(); } }}
                className="w-full rounded border border-outline-variant/25 bg-surface-container-high py-3 pl-12 pr-4 font-mono text-sm text-white placeholder:text-on-surface-variant/30 focus:outline-none"
                placeholder="customer@company.com"
              />
            </div>
            <button
              type="button"
              disabled={sending || !email.trim() || !email.includes("@")}
              onClick={() => void handleSend()}
              className="inline-flex items-center gap-2 bg-secondary-container px-6 py-3 font-headline text-xs font-bold uppercase tracking-wider text-black hover:brightness-110 disabled:opacity-40"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MaterialIcon name="send" className="text-lg" />}
              Send
            </button>
          </div>

          <div className="group relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
              <MaterialIcon name="business" className="text-lg" />
            </div>
            <input
              type="text"
              value={companyHint}
              onChange={(e) => setCompanyHint(e.target.value)}
              className="w-full rounded border border-outline-variant/25 bg-surface-container-high py-3 pl-12 pr-4 font-mono text-sm text-white placeholder:text-on-surface-variant/30 focus:outline-none"
              placeholder="Company name (optional — pre-fills their form)"
            />
          </div>
        </div>

        {success && <p className="mt-3 font-mono text-xs text-secondary-fixed">{success}</p>}
        {error && <p className="mt-3 font-mono text-xs text-error">{error}</p>}
      </section>

      {/* Sent links history */}
      <section className="rounded-xl border border-outline-variant/10 bg-surface-container-low">
        <div className="border-b border-outline-variant/10 px-6 py-4">
          <h2 className="font-headline text-lg font-bold text-white">Sent Onboard Links</h2>
        </div>

        {loadingLinks ? (
          <div className="flex items-center gap-2 px-6 py-8 font-mono text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : links.length === 0 ? (
          <p className="px-6 py-8 text-center font-mono text-sm text-on-surface-variant">
            No onboard links sent yet.
          </p>
        ) : (
          <table className="w-full border-collapse text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-outline-variant/15 bg-surface-container-lowest">
                {["Email", "Company", "Status", "Sent"].map((h) => (
                  <th key={h} className="px-4 py-3 text-[10px] uppercase tracking-widest text-outline">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-on-surface">
              {links.map((link) => (
                <tr key={link.id} className="hover:bg-surface-container-highest/50">
                  <td className="px-4 py-3 text-white">{link.email}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{link.company_hint || "\u2014"}</td>
                  <td className="px-4 py-3">
                    {link.used ? (
                      <span className="text-secondary-fixed">Account created</span>
                    ) : (
                      <span className="text-amber-400">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-outline">
                    {new Date(link.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="font-mono text-[10px] text-outline">
        <Link href="/" className="text-secondary-fixed hover:underline">
          &larr; Command Center
        </Link>
      </p>
    </div>
  );
}
