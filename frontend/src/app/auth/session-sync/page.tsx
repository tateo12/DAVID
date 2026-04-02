"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { setSession } from "@/lib/session";
import type { AuthUser } from "@/lib/session";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export default function SessionSyncPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }

      try {
        const r = await fetch(`${API_BASE}/api/auth/provision`, {
          method: "POST",
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        if (r.ok) {
          const prov = (await r.json()) as { expires_at: string; user: AuthUser };
          setSession({
            access_token: data.session.access_token,
            expires_at: prov.expires_at,
            user: prov.user,
          });
          router.replace("/");
        } else {
          router.replace("/login");
        }
      } catch {
        router.replace("/login");
      }
    })();
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-surface font-mono text-on-surface-variant">
      Signing in…
    </div>
  );
}
