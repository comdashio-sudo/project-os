import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { isLanguage, LANGUAGE_STORAGE_KEY, type Language } from "@/lib/language";
import { useLanguage } from "./LanguageContext";
import { AccountLanguageProvider } from "./accountLanguage";

/** The device's own copy of the choice. The provider writes it only when a choice is made, so what is there is the device's own choice (or nothing). */
function deviceChoice(): Language | null {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch { return null; }
}

/** An address that names a language (?lang=) wins for that visit, so the account does not override it. */
function addressNamesLanguage(): boolean {
  try { return isLanguage(new URLSearchParams(window.location.search).get("lang")); } catch { return false; }
}

/** Keeps the interface language on the signed-in person's account (work order 16, item 4, G-203), so it follows them to any device.
 *  On sign-in: when the account has a language it is used; when it has none, the device's own choice is saved to the account once.
 *  If the account cannot be reached, the device's copy stays and nothing is written. Signed out, nothing is read or written here.
 *  A choice the person makes is never overwritten by the account's answer to a sign-in that was still in flight. */
export function LanguageAccountSync({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { setLanguage } = useLanguage();
  const utils = trpc.useUtils();
  const write = trpc.languagePreference.set.useMutation({
    // A failed save changes nothing on the screen: the device keeps the choice, and the next choice or sign-in saves again.
    onError: () => undefined,
  });
  // The hooks' functions are read through refs, so the sign-in effect below runs once per sign-in and not on every render.
  const utilsRef = useRef(utils); utilsRef.current = utils;
  const writeRef = useRef(write.mutate); writeRef.current = write.mutate;
  // Set when the person chooses a language; cleared when a sign-in starts. A choice made while the account is still being read stands.
  const chosenRef = useRef(false);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (userId === null) return;
    chosenRef.current = false;
    let stillSignedIn = true;
    utilsRef.current.languagePreference.get.fetch(undefined, { staleTime: 0, retry: false }).then(
      account => {
        if (!stillSignedIn || addressNamesLanguage() || chosenRef.current) return;
        if (account) { setLanguage(account); return; }
        const own = deviceChoice();
        if (own) writeRef.current({ language: own });
      },
      () => {
        // The account cannot be reached: the device's own copy is what the person sees, as it was before sign-in.
      },
    );
    return () => { stillSignedIn = false; };
  }, [userId, setLanguage]);

  // The switch calls this after it has changed the language on the device. Signed in, the choice is also saved on the account.
  const save = useCallback((language: Language) => {
    chosenRef.current = true;
    if (userId === null) return;
    writeRef.current({ language });
  }, [userId]);

  const value = useMemo(() => ({ signedIn: userId !== null, save }), [userId, save]);
  return <AccountLanguageProvider value={value}>{children}</AccountLanguageProvider>;
}
