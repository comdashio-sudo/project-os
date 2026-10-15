import React from "react";

const BRAND_ASSETS = {
  horizontal: "/brand/logo-horizontal.svg",
  horizontalOnDark: "/brand/logo-horizontal-on-dark.svg",
  icon: "/brand/icon-primary.svg",
} as const;

export function BrandMark({ onDark = false, className = "" }: { onDark?: boolean; className?: string }) {
  return <img src={onDark ? BRAND_ASSETS.horizontalOnDark : BRAND_ASSETS.horizontal} alt="Dashio" className={`object-contain ${className}`} />;
}

export function BrandIcon({ className = "", alt = "" }: { className?: string; alt?: string }) {
  return <img src={BRAND_ASSETS.icon} alt={alt} className={`object-contain ${className}`} />;
}
