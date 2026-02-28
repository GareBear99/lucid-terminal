import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-neutral-900 text-white p-8 font-mono overflow-auto">
                    <h1 className="text-2xl text-red-500 mb-4 font-bold">Something went wrong</h1>
                    <div className="bg-neutral-800 p-4 rounded border border-neutral-700 mb-4">
                        <h2 className="text-xl mb-2 text-yellow-500">{this.state.error?.toString()}</h2>
                        <details className="whitespace-pre-wrap text-sm text-neutral-400">
                            {this.state.errorInfo?.componentStack}
                        </details>
                    </div>
                    <button
                        className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                        onClick={() => window.location.reload()}
                    >
                        Reload Window
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
