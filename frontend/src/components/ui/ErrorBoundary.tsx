import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-4xl">⚠️</p>
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Algo deu errado</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{this.state.error.message}</p>
          <button
            className="text-sm underline"
            style={{ color: 'var(--color-primary)' }}
            onClick={() => this.setState({ error: null })}
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
