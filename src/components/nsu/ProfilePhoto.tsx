import { useEffect, useState, type ComponentProps } from "react";
import { supabase } from "@/integrations/supabase/client";
import { profilePhotoPath } from "@/lib/nsu";

const PLACEHOLDER = "/icon-192.png";
const URL_LIFETIME_SECONDS = 5 * 60;
const REFRESH_MS = 4 * 60 * 1000;

/** Resolve private object paths on demand, so saved profile photos never expire. */
export function ProfilePhoto({ src = "", alt, ...props }: ComponentProps<"img">) {
  const path = profilePhotoPath(src);
  const [resolved, setResolved] = useState<{ source: string; url: string } | null>(null);

  useEffect(() => {
    if (!path) return;
    let active = true;
    const refresh = async () => {
      try {
        const { data } = await supabase.storage
          .from("profile-photos")
          .createSignedUrl(path, URL_LIFETIME_SECONDS);
        if (active) setResolved({ source: src, url: data?.signedUrl ?? PLACEHOLDER });
      } catch {
        if (active) setResolved({ source: src, url: PLACEHOLDER });
      }
    };
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [src, path]);

  return (
    <img
      {...props}
      alt={alt}
      referrerPolicy="no-referrer"
      src={path ? (resolved?.source === src ? resolved.url : PLACEHOLDER) : src || PLACEHOLDER}
    />
  );
}
