import { Component, type ReactNode } from "react";

interface RendererBoundaryProps {
  readonly children: ReactNode;
  readonly name: string;
}

interface RendererBoundaryState {
  readonly error: string | undefined;
}

export class RendererBoundary extends Component<
  RendererBoundaryProps,
  RendererBoundaryState
> {
  override state: RendererBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: unknown): RendererBoundaryState {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  override render() {
    if (this.state.error !== undefined) {
      return (
        <div className="renderer-error" role="alert">
          <h3>{this.props.name} failed</h3>
          <p>No semantic result was changed.</p>
          <code>{this.state.error}</code>
        </div>
      );
    }
    return this.props.children;
  }
}
