import { useAuth } from "@/_core/hooks/useAuth";
import { DashboardLayoutSkeleton } from "@/components/DashboardLayoutSkeleton";
import { MfaGate } from "@/components/MfaGate";
import { startLogin } from "@/const";
import { useEffect } from "react";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  useEffect(() => {
    if (!loading && !user) startLogin();
  }, [loading, user]);

  if (loading || !user) return <DashboardLayoutSkeleton />;
  return <MfaGate>{children}</MfaGate>;
}
