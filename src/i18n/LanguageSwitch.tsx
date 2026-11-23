import { Select } from "antd";
import { APP_LANGS, APP_LANG_NAMES, getLang, setLang, type AppLang } from "./index";

/** Italian / English. Choosing one saves it and reloads the page (see ./index.ts). */
export function LanguageSwitch({ onDark = false, style }: { onDark?: boolean; style?: React.CSSProperties }) {
  return (
    <Select<AppLang>
      size="small"
      variant="filled"
      value={getLang()}
      onChange={setLang}
      aria-label="Language / Lingua"
      options={APP_LANGS.map((l) => ({ value: l, label: APP_LANG_NAMES[l] }))}
      style={{ width: 110, ...(onDark ? { background: "rgba(255,255,255,.14)", color: "#fff" } : {}), ...style }}
    />
  );
}
