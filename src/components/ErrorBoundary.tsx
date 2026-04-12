import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

const BG = 'radial-gradient(ellipse 130% 70% at 50% -5%, #0e3d20 0%, #051508 55%, #010804 100%)';

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: BG }}>
          <div
            className="w-full max-w-sm rounded-2xl p-6 text-center"
            style={{
              background: 'rgba(8, 22, 10, 0.92)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
            }}
          >
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-lg font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-sm mb-5" style={{ color: 'rgba(134,187,134,0.6)' }}>
              {this.state.error.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 font-bold rounded-xl text-sm tracking-wide"
              style={{
                background: 'linear-gradient(to bottom, #d4a017, #a07010)',
                color: '#1a0f00',
                boxShadow: '0 4px 14px rgba(212,160,23,0.35)',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
