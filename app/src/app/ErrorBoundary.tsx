/**
 * A render error shows a message and a way back, never a blank page. The store survives a
 * reload only as far as IndexedDB — settings, key, library, recents — which is everything that
 * matters.
 */

import React from "react";

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Cutline crashed while drawing the screen", error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h1>Cutline hit a problem drawing this screen.</h1>
        <p>Nothing on disk is affected. Reloading brings back your settings, teams and recent shoots.</p>
        <pre className="crash-detail">{this.state.error.message}</pre>
        <div className="crash-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => window.location.reload()}>Reload</button>
          <button type="button" className="btn btn-ghost btn-lg" onClick={() => this.setState({ error: null })}>Try to continue</button>
        </div>
      </div>
    );
  }
}
