import React from "react";

const PERF_ENV_FLAG = String(import.meta.env.VITE_TABLE_OVERVIEW_PERF_DEBUG || "").trim() === "1";
const WINDOW_FLAG_KEY = "__BEYPRO_TABLE_PERF_DEBUG__";
const WINDOW_METRICS_KEY = "__BEYPRO_TABLE_PERF_METRICS__";

const ensureMetricsStore = () => {
  if (typeof window === "undefined") return null;
  if (!window[WINDOW_METRICS_KEY]) {
    window[WINDOW_METRICS_KEY] = {
      commits: {},
      renders: {},
      traces: [],
    };
  }
  return window[WINDOW_METRICS_KEY];
};

export const isTablePerfDebugEnabled = () => {
  if (!import.meta.env.DEV) return false;
  if (PERF_ENV_FLAG) return true;
  if (typeof window === "undefined") return false;
  return window[WINDOW_FLAG_KEY] === true;
};

const pushTrace = (entry) => {
  const store = ensureMetricsStore();
  if (!store) return;
  store.traces.push({ at: Date.now(), ...entry });
  if (store.traces.length > 500) {
    store.traces.splice(0, store.traces.length - 500);
  }
};

export const useRenderCount = (label, options = {}) => {
  const countRef = React.useRef(0);
  countRef.current += 1;

  const enabled = isTablePerfDebugEnabled();
  const id = options?.id == null ? "" : String(options.id);
  const logEvery = Number.isFinite(options?.logEvery) && options.logEvery > 0 ? options.logEvery : 1;

  if (enabled) {
    const store = ensureMetricsStore();
    const renderKey = id ? `${label}:${id}` : label;
    if (store) {
      store.renders[renderKey] = countRef.current;
    }

    const shouldLog = countRef.current <= 3 || countRef.current % logEvery === 0;
    if (shouldLog) {
      console.log(`[perf][render] ${renderKey} #${countRef.current}`);
    }
  }

  return countRef.current;
};

export function RenderCounter({ label, value, className = "" }) {
  if (!isTablePerfDebugEnabled()) return null;
  return React.createElement(
    "span",
    {
      className: `inline-flex items-center rounded bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold text-white ${className}`,
    },
    `${label}: ${value}`
  );
}

export const createProfilerOnRender = (id) => {
  return (_profilerId, phase, actualDuration, baseDuration, startTime, commitTime) => {
    if (!isTablePerfDebugEnabled()) return;

    const store = ensureMetricsStore();
    if (store) {
      if (!Array.isArray(store.commits[id])) {
        store.commits[id] = [];
      }
      store.commits[id].push({
        phase,
        actualDuration,
        baseDuration,
        startTime,
        commitTime,
      });
      if (store.commits[id].length > 300) {
        store.commits[id].splice(0, store.commits[id].length - 300);
      }
    }

    console.log(
      `[perf][profiler] ${id} phase=${phase} actual=${actualDuration.toFixed(2)}ms base=${baseDuration.toFixed(
        2
      )}ms`
    );
  };
};

export const logMemoDiff = ({ component, key, prevProps, nextProps, watchedProps }) => {
  if (!isTablePerfDebugEnabled()) return;
  const changed = [];

  (Array.isArray(watchedProps) ? watchedProps : []).forEach((propName) => {
    if (prevProps[propName] !== nextProps[propName]) {
      changed.push(propName);
    }
  });

  if (changed.length === 0) return;

  const suffix = key == null ? "" : `:${key}`;
  console.log(`[perf][memo] ${component}${suffix} re-rendered because ${changed.join(", ")}`);
  pushTrace({
    type: "memo-diff",
    component,
    key,
    changed,
  });
};

export const markPerfTrace = (label, payload = {}) => {
  if (!isTablePerfDebugEnabled()) return;
  console.log(`[perf][trace] ${label}`, payload);
  pushTrace({ type: "trace", label, payload });
};

export const withPerfTimer = (label, fn) => {
  if (!isTablePerfDebugEnabled()) return fn();
  console.time(label);
  try {
    return fn();
  } finally {
    console.timeEnd(label);
  }
};
