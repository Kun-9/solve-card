import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase";

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading,
    configured: isSupabaseConfigured,
  };
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
    },
  });
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export function displayNameFrom(user: User | null): string {
  if (!user) return "";
  const meta = user.user_metadata as Record<string, unknown> | null | undefined;
  const name =
    (meta?.["name"] as string | undefined) ??
    (meta?.["full_name"] as string | undefined) ??
    user.email ??
    "";
  return name;
}

export function avatarUrlFrom(user: User | null): string | null {
  if (!user) return null;
  const meta = user.user_metadata as Record<string, unknown> | null | undefined;
  return (
    (meta?.["avatar_url"] as string | undefined) ??
    (meta?.["picture"] as string | undefined) ??
    null
  );
}
