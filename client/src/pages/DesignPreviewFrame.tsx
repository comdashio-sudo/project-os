import React from "react";
import { useParams } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { DirectionProvider, DIRECTIONS, EmptyState, Toaster, type DirectionId, type Mode } from "@/components/ds";
import { ImportScreen } from "@/design/screens/ImportScreen";
import { SetupWizardScreen } from "@/design/screens/SetupWizardScreen";
import "@/design/directions.css";

// One redrawn screen at the full width of the window, in one direction: the design preview embeds this in frames of 390px and 1280px, and the owner can open it on its own.
export default function DesignPreviewFrame() {
  const { direction, screen } = useParams<{ direction: string; screen: string }>();
  const { user, loading } = useAuth();
  if (loading) return <main className="p-6"><p role="status">…</p></main>;
  if (user?.role !== "admin") return <main className="p-6"><EmptyState title="—" /></main>;
  const id = (direction in DIRECTIONS ? direction : "a") as DirectionId;
  const mode: Mode = new URLSearchParams(window.location.search).get("mode") === "dark" ? "dark" : "light";
  return <DirectionProvider direction={id} mode={mode}>{screen === "import" ? <ImportScreen /> : <SetupWizardScreen />}<Toaster /></DirectionProvider>;
}
