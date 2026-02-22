import React from "react";

class OrdersErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    globalThis.console.error("Orders panel crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mt-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_30px_60px_-35px_rgba(15,23,42,0.18)] dark:border-slate-800 dark:bg-slate-950/60 dark:shadow-[0_30px_60px_-35px_rgba(0,0,0,0.6)]">
          <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Something went wrong.
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default OrdersErrorBoundary;
