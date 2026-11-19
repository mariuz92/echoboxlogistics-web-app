import { theme as antdTheme, type ThemeConfig } from "antd";

/**
 * Brand palette. `navy` is the ink of the Rondo logo (a very dark green-blue),
 * used for the sidebar and dark headers; blue for actions; coral and pale blue
 * for charts.
 */
export const brand = {
  navy: "#172423",
  navyLight: "#223532",
  primary: "#1d5fa8",
  primaryDark: "#4c93dd", // primary tuned for dark surfaces
  coral: "#ef6f61",
  wave: "#bcd9f5",
};

export type ThemeMode = "light" | "dark";

const shared: ThemeConfig["token"] = {
  fontFamily:
    '"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  fontSize: 14,
  borderRadius: 10,
  borderRadiusLG: 14,
  borderRadiusSM: 8,
  colorSuccess: "#16a34a",
  colorWarning: "#d97706",
  colorError: "#dc2626",
  colorInfo: "#0284c7",
  controlHeight: 38,
  controlHeightLG: 46,
  motionDurationMid: "0.2s",
  wireframe: false,
};

export function getTheme(mode: ThemeMode): ThemeConfig {
  const dark = mode === "dark";

  return {
    algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      ...shared,
      colorPrimary: dark ? brand.primaryDark : brand.primary,
      colorBgLayout: dark ? "#0d1621" : "#f4f6f9",
      colorBgContainer: dark ? "#152231" : "#ffffff",
      colorBgElevated: dark ? "#1a2a3b" : "#ffffff",
      colorBorderSecondary: dark ? "#223347" : "#e8edf3",
      boxShadowTertiary: dark
        ? "0 1px 2px rgba(0,0,0,.4)"
        : "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)",
    },
    components: {
      Layout: {
        headerBg: dark ? "#152231" : "#ffffff",
        headerHeight: 64,
        headerPadding: "0 24px",
        siderBg: brand.navy,
        triggerBg: brand.navyLight,
        bodyBg: dark ? "#0d1621" : "#f4f6f9",
      },
      Menu: {
        darkItemBg: brand.navy,
        darkSubMenuItemBg: brand.navy,
        darkItemSelectedBg: "rgba(188, 217, 245, 0.14)",
        darkItemSelectedColor: "#ffffff",
        darkItemColor: "rgba(255,255,255,0.72)",
        darkItemHoverBg: "rgba(255,255,255,0.07)",
        itemBorderRadius: 8,
        itemMarginInline: 10,
        itemHeight: 44,
      },
      Card: {
        borderRadiusLG: 14,
        headerFontSize: 16,
      },
      Table: {
        headerBg: dark ? "#1a2a3b" : "#f7f9fc",
        headerColor: dark ? "rgba(255,255,255,.75)" : "#475467",
        rowHoverBg: dark ? "#1b2c3f" : "#f5f9ff",
        borderColor: dark ? "#223347" : "#e8edf3",
        cellPaddingBlock: 12,
      },
      Button: {
        fontWeight: 500,
        primaryShadow: "none",
      },
      Statistic: {
        titleFontSize: 13,
        contentFontSize: 26,
      },
      Drawer: {
        footerPaddingBlock: 14,
      },
    },
  };
}
