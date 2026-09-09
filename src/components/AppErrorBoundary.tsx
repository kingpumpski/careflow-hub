import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CareFlow failed during application startup/render", error, info.componentStack);
  }

  private reload = () => window.location.reload();

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
        <section className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-sm" role="alert" aria-live="assertive">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive" aria-hidden="true">!</div>
            <div>
              <h1 className="text-lg font-semibold">CareFlow could not start</h1>
              <p className="text-sm text-muted-foreground">The application encountered a startup or rendering error.</p>
            </div>
          </div>
          <details className="mb-5 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">Technical details</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">{this.state.error.message}</pre>
          </details>
          <button type="button" onClick={this.reload} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-md">
            Reload application
          </button>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;
