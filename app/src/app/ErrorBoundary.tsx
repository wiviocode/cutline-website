import { Component, type ReactNode } from "react";

/** A render error shows itself and a way back, instead of a blank page. Nothing on disk is lost. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="welcome">
        <div className="welcome-card">
          <h1>Something went wrong on this screen.</h1>
          <p className="muted">Captions already approved are in your files, and every reading is saved beside the photographs. Reloading picks up where you were.</p>
          <pre className="meta" style={{ whiteSpace: "pre-wrap" }}>{this.state.error.message}</pre>
          <div className="row"><button type="button" className="btn btn-primary" onClick={() => location.reload()}>Reload</button>
            <button type="button" className="btn" onClick={() => this.setState({ error: null })}>Try to continue</button></div>
        </div>
      </div>
    );
  }
}
