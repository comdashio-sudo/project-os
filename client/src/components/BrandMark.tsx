import React from "react";

const BRAND_ASSETS = {
  horizontal: "/manus-storage/logo-horizontal_2c69258c.svg",
  horizontalOnDark: "/manus-storage/logo-horizontal-on-dark_d91963f2.svg",
  icon: "/manus-storage/icon-primary_92c0b589.svg",
} as const;

export function BrandMark({ onDark = false, className = "" }: { onDark?: boolean; className?: string }) {
  return <img src={onDark ? BRAND_ASSETS.horizontalOnDark : BRAND_ASSETS.horizontal} alt="Dashio" className={`object-contain ${className}`} />;
}

export function BrandIcon({ className = "", alt = "" }: { className?: string; alt?: string }) {
  return <img src={BRAND_ASSETS.icon} alt={alt} className={`object-contain ${className}`} />;
}
