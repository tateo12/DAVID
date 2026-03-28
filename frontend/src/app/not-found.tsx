import Link from "next/link";
import { ShieldMark } from "@/components/shield-mark";

/** App Router 404 — avoids falling through to a broken Pages fallback chunk in dev (`Cannot find module './xxx.js'`). */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-lg flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <ShieldMark size={56} className="text-secondary-fixed" title="Sentinel" />
      <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-outline">404 · Signal lost</p>
        <h1 className="font-headline text-2xl font-bold tracking-tight text-white">Page not in catalog</h1>
        <p className="text-sm leading-relaxed text-on-surface-variant">
          That route does not exist. Use the sidebar or return to the command center.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded border border-secondary-container/40 bg-secondary-container/15 px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-secondary-fixed transition hover:bg-secondary-container/25"
        >
          Command center
        </Link>
        <Link
          href="/prompts"
          className="rounded border border-outline-variant/25 px-5 py-2.5 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant transition hover:border-outline-variant/50 hover:text-white"
        >
          Security logs
        </Link>
      </div>
    </div>
  );
}
