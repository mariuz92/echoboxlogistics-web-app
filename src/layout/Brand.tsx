import { Link } from "react-router";
import { CONFIG } from "../config/configuration";

interface BrandProps {
  /** Square mark only (collapsed sidebar). */
  compact?: boolean;
  /** White logo for dark backgrounds. */
  onDark?: boolean;
  /** Where the logo links to; `false` renders it without a link. */
  to?: string | false;
}

/** The EchoBox logo (wordmark with "logistics"), or the square "e" mark when space is tight. */
export function Brand({ compact = false, onDark = false, to = "/" }: BrandProps) {
  const content = compact ? (
    <img src={CONFIG.mark} alt={CONFIG.appName} width={34} height={34} style={{ display: "block", borderRadius: 9 }} />
  ) : (
    <img
      src={onDark ? CONFIG.logoOnDark : CONFIG.logoOnLight}
      alt={CONFIG.appName}
      width={146}
      height={40}
      style={{ display: "block", height: 40, width: "auto" }}
    />
  );

  if (to === false) return content;
  return (
    <Link to={to} aria-label={CONFIG.appName} style={{ display: "inline-flex", textDecoration: "none" }}>
      {content}
    </Link>
  );
}
