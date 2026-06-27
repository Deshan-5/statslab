"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error inside ToolCanvas:", error, errorInfo);
  }

  private handleReset = () => {
    const isChunkError = this.state.error && (
      this.state.error.name === "ChunkLoadError" ||
      this.state.error.message.toLowerCase().includes("chunk") ||
      this.state.error.message.toLowerCase().includes("loading")
    );
    if (isChunkError) {
      window.location.reload();
    } else {
      this.setState({ hasError: false, error: null });
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      const isChunkError = this.state.error && (
        this.state.error.name === "ChunkLoadError" ||
        this.state.error.message.toLowerCase().includes("chunk") ||
        this.state.error.message.toLowerCase().includes("loading")
      );
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-red-100 dark:border-red-950/40 bg-red-50/30 dark:bg-red-950/10 min-h-[400px]">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/10 text-red-500 mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-lg">
            {isChunkError ? "App Update or Connection Refresh Required" : "Something went wrong in the tool canvas"}
          </h3>
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400 max-w-md">
            {isChunkError 
              ? "A compiled application chunk failed to load. This usually happens after a workspace rebuild or HMR update." 
              : "An error occurred while rendering the visualization. This could be due to unexpected input values or a rendering glitch."}
          </p>
          {this.state.error && (
            <pre className="mt-4 p-3 bg-neutral-900 text-red-400 font-mono text-[10px] text-left rounded-lg max-w-lg overflow-x-auto border border-neutral-800">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-5 py-2 text-xs font-semibold hover:opacity-95 transition-opacity"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {isChunkError ? "Reload Page" : "Reload Tool"}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
