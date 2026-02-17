  export default function ProgressBar({ value = 0, label, compact = false }) {
    const pct = Math.max(0, Math.min(100, Math.round(value)));

    return (
      <div className={compact ? "w-full" : "w-full"}>
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-2 bg-gradient-to-r from-blue-500 to-indigo-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-xs text-slate-300 mt-1">
          {label ?? `${pct}%`}
        </div>
      </div>
    );
  }
