import { useUiText } from "@/components/ui/uiText";
import { Loader2Icon } from "lucide-react";

import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const ut = useUiText();
  return (
    <Loader2Icon
      role="status"
      aria-label={ut({ ar: "جارٍ التحميل", en: "Loading", ur: "لوڈ ہو رہا ہے" })}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
