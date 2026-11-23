import { theme as antdTheme } from "antd";
import { brand } from "../../../config/theme";

/** Axis, grid and tooltip styling that follows the light or dark theme. */
export function useChartStyle() {
  const { token } = antdTheme.useToken();
  return {
    token,
    axis: { stroke: token.colorTextTertiary, fontSize: 12 } as const,
    grid: token.colorBorderSecondary,
    tooltip: {
      background: token.colorBgElevated,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 8,
      color: token.colorText,
    },
    /** the data colour, and a quiet version of it for the bars that are not the point */
    main: brand.primary,
    quiet: `${brand.primary}59`,
    accent: brand.coral,
  };
}
