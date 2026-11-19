import { Link } from "react-router";
import { CONFIG } from "../config/configuration";

interface BrandProps {
  /** Square mark only (collapsed sidebar). */
  compact?: boolean;
  /** White wordmark for dark backgrounds. */
  onDark?: boolean;
  /** Where the logo links to; `false` renders it without a link. */
  to?: string | false;
}

/** The Rondo logo: the wordmark, or the square "o" mark when space is tight. */
export function Brand({ compact = false, onDark = false, to = "/" }: BrandProps) {
  const content = compact ? (
    <img src={CONFIG.mark} alt={CONFIG.appName} width={34} height={34} style={{ display: "block", borderRadius: 9 }} />
  ) : (
    <img
      src={onDark ? CONFIG.logoOnDark : CONFIG.logoOnLight}
      alt={CONFIG.appName}
      height={26}
      width={92}
      style={{ display: "block", height: 26, width: "auto" }}
    />
  );

  if (to === false) return content;
  return (
    <Link to={to} aria-label={CONFIG.appName} style={{ display: "inline-flex", textDecoration: "none" }}>
      {content}
    </Link>
  );
}
