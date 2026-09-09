"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { friendlyError, signInSocial, type SocialProviderName } from "@/lib/auth";

const PROVIDERS: { id: SocialProviderName; label: string; borderClass: string }[] = [
  { id: "google", label: "Google", borderClass: "hover:border-[#4285F4]" },
  { id: "apple", label: "Apple", borderClass: "hover:border-[#A2AAAD]" },
  { id: "twitter", label: "X", borderClass: "hover:border-text" },
];

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4-3.11z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.61l4 3.11C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#e8ddd0" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.462 2.222-1.208 3.032-.83.897-2.183 1.582-3.294 1.492-.15-1.115.42-2.278 1.176-3.058.844-.876 2.312-1.53 3.326-1.466zm4.646 16.988c-.428.996-.633 1.44-1.183 2.32-.767 1.234-1.85 2.77-3.19 2.784-1.19.014-1.497-.774-3.115-.765-1.617.009-1.955.78-3.147.766-1.34-.014-2.365-1.4-3.13-2.634C4.98 18.11 4.207 13.9 5.66 11.08c.83-1.61 2.31-2.628 3.916-2.652 1.16-.023 2.257.782 2.968.782.71 0 2.037-.966 3.434-.824.585.024 2.23.236 3.287 1.78-.085.053-1.963 1.146-1.942 3.42.024 2.718 2.384 3.622 2.41 3.634z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#e8ddd0" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const ICONS: Record<SocialProviderName, () => JSX.Element> = {
  google: GoogleIcon,
  apple: AppleIcon,
  twitter: XIcon,
};

/** Three social sign-in buttons (Google, Apple, X) that share the signInSocial flow and redirect to /reader. */
export default function SocialButtons() {
  const router = useRouter();
  const [loadingProvider, setLoadingProvider] = useState<SocialProviderName | null>(null);

  async function handleClick(id: SocialProviderName) {
    setLoadingProvider(id);
    try {
      await signInSocial(id);
      toast.success("Welcome to ÍléOtaku!");
      router.push("/reader");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setLoadingProvider(null);
    }
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {PROVIDERS.map((provider) => {
        const Icon = ICONS[provider.id];
        return (
          <button
            key={provider.id}
            type="button"
            onClick={() => handleClick(provider.id)}
            disabled={loadingProvider !== null}
            aria-label={`Continue with ${provider.label}`}
            className={`flex items-center justify-center rounded-lg border border-muted2 bg-bg3 py-2.5 transition-colors disabled:opacity-50 ${provider.borderClass}`}
          >
            {loadingProvider === provider.id ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            ) : (
              <Icon />
            )}
          </button>
        );
      })}
    </div>
  );
}
