import { createLightTheme, BrandVariants } from "@fluentui/react-components";

const mercyBrand: BrandVariants = {
  10: "#030712",
  20: "#07111F",
  30: "#0A1C32",
  40: "#0E2A4A",
  50: "#143A64",
  60: "#1D4C80",
  70: "#2D629B",
  80: "#477BB3",
  90: "#6995C7",
  100: "#8DB0D8",
  110: "#B1CCE7",
  120: "#D3E5F4",
  130: "#E8F1FA",
  140: "#F3F8FD",
  150: "#F8FBFE",
  160: "#FFFFFF"
};

export const mercyTheme = {
  ...createLightTheme(mercyBrand),
  colorBrandForeground1: "#0E2A4A",
  colorBrandBackground: "#0E2A4A",
  colorBrandBackgroundHover: "#143A64",
  colorBrandStroke1: "#C9A44C",
  borderRadiusMedium: "8px",
  fontFamilyBase: "\"Segoe UI\", system-ui, sans-serif"
};
