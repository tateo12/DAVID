"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function RegisterInviteRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  useEffect(() => {
    // Redirect old invite links to the new setup-account page
    const url = token ? `/setup-account?token=${token}` : "/login";
    router.replace(url);
  }, [router, token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background font-mono text-on-surface-variant">
      Redirecting...
    </div>
  );
}

export default function RegisterInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background font-mono text-on-surface-variant">
          Loading...
        </div>
      }
    >
      <RegisterInviteRedirect />
    </Suspense>
  );
}
