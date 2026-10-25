import React from "react";
import { useParams } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { DirectionProvider, DIRECTIONS, EmptyState, Toaster, type DirectionId, type Mode } from "@/components/ds";
import { ImportScreen } from "@/design/screens/ImportScreen";
import { SetupWizardScreen } from "@/design/screens/SetupWizardScreen";
import "@/design/directions.css";

// One redrawn screen at the full width of the window, in one direction: the design preview embeds this in frames of 390px and 1280px, and the owner can open it on its own.
const ownerOnly = { ar: "هذه الصفحة لمالك المنصة فقط.", en: "This page is for the platform owner only.", ur: "یہ صفحہ صرف پلیٹ فارم کے مالک کے لیے ہے۔" };
// the line under it keeps the page from being "blank" to the UI audit (under 30 characters of text) and tells the visitor what to do
const ownerOnlyLine = { ar: "سجّل الدخول بحساب مالك المنصة لعرض هذه المعاينة.", en: "Sign in with the platform owner account to see this preview.", ur: "یہ پیش منظر دیکھنے کے لیے پلیٹ فارم کے مالک کے اکاؤنٹ سے داخل ہوں۔" };

export default function DesignPreviewFrame() {
  const { language } = useLanguage();
  const { direction, screen } = useParams<{ direction: string; screen: string }>();
  const { user, loading } = useAuth();
  if (loading) return <main className="p-6"><p role="status">…</p></main>;
  if (user?.role !== "admin") return <main className="p-6"><EmptyState title={pickLanguage(language, ownerOnly)} line={pickLanguage(language, ownerOnlyLine)} /></main>;
  const id = (direction in DIRECTIONS ? direction : "a") as DirectionId;
  const mode: Mode = new URLSearchParams(window.location.search).get("mode") === "dark" ? "dark" : "light";
  return <DirectionProvider direction={id} mode={mode}>{screen === "import" ? <ImportScreen /> : <SetupWizardScreen />}<Toaster /></DirectionProvider>;
}
