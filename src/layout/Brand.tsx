import { Flex, Typography } from "antd";
import { Link } from "react-router";
import { CONFIG } from "../config/configuration";

interface BrandProps {
  /** Logo only (collapsed sidebar). */
  compact?: boolean;
  /** Light text for dark backgrounds. */
  onDark?: boolean;
  /** Where the logo links to; `false` renders it without a link. */
  to?: string | false;
}

export function Brand({ compact = false, onDark = false, to = "/" }: BrandProps) {
  const content = (
    <Flex align="center" gap={10}>
      <img
        src={CONFIG.logo}
        alt=""
        width={34}
        height={34}
        style={{ borderRadius: 9, display: "block" }}
      />
      {!compact && (
        <Typography.Text
          strong
          style={{
            fontSize: 16,
            letterSpacing: "-0.01em",
            color: onDark ? "#fff" : undefined,
            whiteSpace: "nowrap",
          }}
        >
          {CONFIG.appName}
        </Typography.Text>
      )}
    </Flex>
  );

  if (to === false) return content;
  return (
    <Link to={to} aria-label={CONFIG.appName} style={{ textDecoration: "none" }}>
      {content}
    </Link>
  );
}
