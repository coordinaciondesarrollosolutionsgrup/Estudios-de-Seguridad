import { useEffect, useRef, useState } from "react";

export default function NiceSelect({
  label,
  value,
  onChange,
  options = [],            // [{ value, label }]
  placeholder = "Seleccione…",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const listRef = useRef(null);

  const current = options.find(o => String(o.value) === String(value));

  useEffect(() => {
    const onDocClick = (e) => {
      if (!btnRef.current) return;
      if (!btnRef.current.contains(e.target) && !listRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleKey = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setOpen(true);
    } else if (open && e.key === "Escape") {
      setOpen(false);
    }
  };

  const pick = (v) => {
    onChange?.(v);
    setOpen(false);
  };

  return (
    <label className={`text-sm text-slate-200 ${className}`}>
      {label && <div className="mb-1 font-medium">{label}</div>}

      <div className="relative">
        {/* Botón “glass” */}
        <button
          type="button"
          ref={btnRef}
          onClick={() => setOpen(o => !o)}
          onKeyDown={handleKey}
          className="w-full rounded-xl border border-white/10 bg-white/10 p-3 pr-10 text-left text-white outline-none
                     focus:border-white/30 focus:ring-2 focus:ring-blue-500/30"
        >
          <span className={current ? "" : "text-white/40"}>
            {current ? current.label : placeholder}
          </span>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/60">▾</span>
        </button>

        {/* Panel */}
        {open && (
          <div
            ref={listRef}
            className="absolute z-50 mt-2 max-h-56 w-full overflow-auto rounded-xl border border-white/10
                       bg-slate-900/95 backdrop-blur-md shadow-xl"
          >
            {options.length === 0 && (
              <div className="p-3 text-xs text-slate-400">Sin opciones</div>
            )}
            {options.map((opt) => {
              const active = String(opt.value) === String(value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => pick(opt.value)}
                  className={`block w-full cursor-pointer px-3 py-2 text-left text-sm
                              hover:bg-white/10 ${active ? "bg-white/5 text-white" : "text-slate-200"}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </label>
  );
}
