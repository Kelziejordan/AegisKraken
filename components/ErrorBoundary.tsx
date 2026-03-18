'use client';

import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-md w-full text-center space-y-4">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
              <span className="text-red-500 text-2xl font-bold">!</span>
            </div>
            <h2 className="text-xl font-bold text-white">System Critical Failure</h2>
            <p className="text-zinc-400 text-sm">The dashboard encountered an unrecoverable error. Tactical engine may still be active.</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-bold transition-colors"
            >
              RELOAD SYSTEM
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
