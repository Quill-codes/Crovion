"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface WebGLErrorBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
}

interface WebGLErrorBoundaryState {
  hasError: boolean;
}

export class WebGLErrorBoundary extends React.Component<
  WebGLErrorBoundaryProps,
  WebGLErrorBoundaryState
> {
  constructor(props: WebGLErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): WebGLErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn("WebGL Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

interface WebGLFallbackProps extends React.HTMLAttributes<HTMLDivElement> {}

export function WebGLFallback({ className, ...props }: WebGLFallbackProps) {
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      {/* Animated gradient fallback when WebGL is not available */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 70% 30%, rgba(139,92,246,0.15), transparent 60%),
            radial-gradient(ellipse 60% 50% at 30% 70%, rgba(109,74,255,0.12), transparent 50%),
            linear-gradient(180deg, #080808 0%, #0d0a1a 50%, #080808 100%)
          `,
        }}
      />
      {/* Subtle animated shimmer */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "linear-gradient(45deg, transparent 30%, rgba(139,92,246,0.06) 50%, transparent 70%)",
          backgroundSize: "200% 200%",
          animation: "shimmer 8s ease-in-out infinite",
        }}
      />
    </div>
  );
}
