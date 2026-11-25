import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Flex, Result } from "antd";
import { reportWebIssue } from "../../features/platform/runtime";
import { t } from "../../i18n";

interface State {
  error: Error | null;
}

/** Last line of defence: an unexpected render error shows a message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
    void reportWebIssue("render", "render_error");
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <Flex align="center" justify="center" style={{ minHeight: "100vh", padding: 24 }}>
        <Result
          status="error"
          title={t("Qualcosa è andato storto")}
          subTitle={t("Si è verificato un errore imprevisto. Ricarica la pagina; se il problema persiste contatta il supporto.")}
          extra={
            <Button type="primary" onClick={() => window.location.assign("/")}>
              {t("Ricarica")}
            </Button>
          }
        />
      </Flex>
    );
  }
}
