import { pickLanguage } from "@/lib/language";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const { language, isRtl } = useLanguage();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      dir={isRtl ? "rtl" : "ltr"}
      containerAriaLabel={pickLanguage(language, { ar: "الإشعارات", en: "Notifications", ur: "اطلاعات" })}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
