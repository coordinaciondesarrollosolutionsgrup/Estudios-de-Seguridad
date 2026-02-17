// src/components/ConsentWizard.jsx
import { useEffect, useMemo, useRef, useState, memo } from "react";
import api from "../api/axios";

const CONSENT_TYPES = { 1: "GENERAL", 2: "CENTRALES", 3: "ACADEMICO" };

/* =============== Firma (Canvas) =============== */
function SignatureCanvas({ onChange, className = "", width = 520, height = 160 }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const pathLenRef = useRef(0);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d");
    const ratio = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    c.width = width * ratio; c.height = height * ratio;
    c.style.width = width + "px"; c.style.height = height + "px";
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";           // trazo negro (legible en PDF)
    c.style.background = "#fff";        // fondo blanco (para la exportación)
  }, [width, height]);

  const pos = (e) => {
    const c = ref.current, r = c.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    pathLenRef.current = 0;
    const { x, y } = pos(e);
    last.current = { x, y };
    const ctx = ref.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = pos(e);
    const ctx = ref.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.stroke();
    const dx = x - last.current.x;
    const dy = y - last.current.y;
    pathLenRef.current += Math.hypot(dx, dy);
    last.current = { x, y };
  };

  const end = (e) => {
    e?.preventDefault?.();
    if (!drawing.current) return;
    drawing.current = false;

    const MIN_PX = 12; // evita “toques” accidentales
    if (pathLenRef.current >= MIN_PX) {
      onChange?.(ref.current.toDataURL("image/png"));
    } else {
      const c = ref.current; const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, c.width, c.height);
      onChange?.(null);
    }
  };

  const clear = () => {
    const c = ref.current; const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    pathLenRef.current = 0;
    onChange?.(null);
  };

  return (
    <div className={className}>
      <div className="rounded-xl border border-white/15 bg-slate-800/70 p-2">
        <canvas
          ref={ref}
          className="touch-none select-none rounded-lg"
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
      </div>
      <button
        type="button"
        onClick={clear}
        className="mt-2 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-800/70 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700/70"
      >
        🧽 Borrar firma
      </button>
    </div>
  );
}

/* ====== Input subrayado con commit en blur ====== */
const LineInput = memo(function LineInput({ value, onCommit, placeholder, className = "min-w-[180px]" }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => { setV(value ?? ""); }, [value]);
  const commit = () => { onCommit?.(v); };
  const onKey = (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); e.currentTarget.blur(); } };
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      placeholder={placeholder}
      className={`mx-1 inline-flex bg-transparent border-b border-white/30 focus:border-white/80 outline-none px-1 text-slate-100 ${className}`}
    />
  );
});

/* ===== util: archivo → dataURL (base64) ===== */
const fileToDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

/* ============== Paso de texto + firmas ============== */
function TextConsentStep({
  step,
  datos, setDatos,
  firmaDraw, setFirmaDraw,
  firmaUploadB64, setFirmaUploadB64,
  uploadPreview, setUploadPreview,
  acepta, setAcepta,
}) {
  const Hoja = ({ children }) => (
    <div className="rounded-xl border border-white/10 bg-slate-800/70 p-4 leading-relaxed text-slate-100 text-sm space-y-3">
      {children}
    </div>
  );
  const C = (k) => (val) => setDatos((s) => ({ ...s, [k]: val }));

  const onPickFile = async (e) => {
    const f = e.target.files?.[0] || null;
    if (!f) {
      if (uploadPreview) URL.revokeObjectURL(uploadPreview);
      setUploadPreview(null);
      setFirmaUploadB64(null);
      return;
    }
    const url = URL.createObjectURL(f);
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadPreview(url);
    try {
      const dataUrl = await fileToDataURL(f);
      setFirmaUploadB64(dataUrl);
    } catch {
      setFirmaUploadB64(null);
    }
  };

  const Paso1 = (
    <Hoja>
      <h3 className="text-base font-semibold">FORMATO AUTORIZACIÓN ESTUDIO DE SEGURIDAD Y VALIDACIÓN DE DATOS PERSONALES</h3>
      <p>
        Yo,<LineInput value={datos.nombre} onCommit={C("nombre")} placeholder="Nombres y apellidos" />,
        mayor de edad, identificado(a) con cédula de ciudadanía No.
        <LineInput value={datos.cc} onCommit={C("cc")} placeholder="CC" className="min-w-[120px]" />, expedida en
        <LineInput value={datos.lugarExp} onCommit={C("lugarExp")} placeholder="Ciudad" className="min-w-[130px]" />,
        actuando en mi propio nombre, de manera libre, voluntaria, expresa, previa e informada, otorgo autorización…
      </p>
      <p>La presente autorización comprende la facultad de consultar, cotejar y verificar información en bases públicas y privadas, listas restrictivas, instituciones educativas y centrales de riesgo financiero.</p>
      <p>
        En constancia se firma en la ciudad de
        <LineInput value={datos.ciudadFirma} onCommit={C("ciudadFirma")} placeholder="Ciudad" />, a los
        <LineInput value={datos.dia} onCommit={C("dia")} placeholder="día" className="w-12" /> días, del mes de
        <LineInput value={datos.mes} onCommit={C("mes")} placeholder="mes" className="w-24" />, del año
        <LineInput value={datos.anio} onCommit={C("anio")} placeholder="20__" className="w-16" />.
      </p>
    </Hoja>
  );

  const Paso2 = (
    <Hoja>
      <h3 className="text-base font-semibold">FORMATO DE AUTORIZACIÓN CONSULTA EN CENTRALES DE RIESGO</h3>
      <p>
        Yo,<LineInput value={datos.nombre} onCommit={C("nombre")} placeholder="Nombres y apellidos" />, identificado(a) con
        cédula de ciudadanía No.<LineInput value={datos.cc} onCommit={C("cc")} placeholder="CC" className="min-w-[130px]" />,
        autorizo la consulta de mi información crediticia ante EXPERIAN y TRANSUNION.
      </p>
      <p>Autorizo su uso exclusivo para la evaluación del proceso y su conservación conforme a la ley.</p>
      <p>
        En constancia, se firma en la ciudad de
        <LineInput value={datos.ciudadFirma} onCommit={C("ciudadFirma")} placeholder="Ciudad" />, a los
        <LineInput value={datos.dia} onCommit={C("dia")} placeholder="día" className="w-12" /> días del mes de
        <LineInput value={datos.mes} onCommit={C("mes")} placeholder="mes" className="w-24" /> del año
        <LineInput value={datos.anio} onCommit={C("anio")} placeholder="20__" className="w-16" />.
      </p>
    </Hoja>
  );

  const Paso3 = (
    <Hoja>
      <h3 className="text-base font-semibold">FORMATO DE AUTORIZACIÓN VERIFICACIÓN DE TÍTULOS ACADÉMICOS</h3>
      <p><b>Referencia:</b> Autorización para verificación de títulos académicos</p>
      <p>
        Yo,<LineInput value={datos.nombre} onCommit={C("nombre")} placeholder="Nombres y apellidos" />, con cédula No.
        <LineInput value={datos.cc} onCommit={C("cc")} placeholder="CC" className="min-w-[130px]" />, expedida en
        <LineInput value={datos.lugarExp} onCommit={C("lugarExp")} placeholder="Ciudad" className="min-w-[130px]" />,
        autorizo la verificación integral de mis títulos y soportes académicos.
      </p>
      <p>
        Firmo en <LineInput value={datos.ciudadFirma} onCommit={C("ciudadFirma")} placeholder="Ciudad" />, a los
        <LineInput value={datos.dia} onCommit={C("dia")} placeholder="día" className="w-12" /> días, del mes de
        <LineInput value={datos.mes} onCommit={C("mes")} placeholder="mes" className="w-24" /> del año
        <LineInput value={datos.anio} onCommit={C("anio")} placeholder="20__" className="w-16" />.
      </p>
    </Hoja>
  );

  return (
    <div className="space-y-4">
      {step === 1 ? Paso1 : step === 2 ? Paso2 : Paso3}

      <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-2 text-xs text-amber-200">
        Obligatorio: dibuja tu firma y sube la imagen de tu firma (ambas).
      </div>

      {/* 1) Dibujar firma */}
      <div>
        <div className="text-sm mb-1">1) Dibujar firma</div>
        <SignatureCanvas
          onChange={(dataUrl) => {
            const ok = dataUrl && dataUrl.startsWith("data:image") && dataUrl.length > 100;
            setFirmaDraw(ok ? dataUrl : null);
          }}
          width={Math.min(520, 520)}
          height={160}
        />
      </div>

      {/* 2) Subir imagen de la firma */}
      <div className="rounded-xl border border-white/15 bg-slate-800/70 p-3">
        <div className="text-sm mb-1">2) Subir imagen de la firma</div>
        <input
          type="file"
          accept="image/*"
          onChange={onPickFile}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-white/10 file:bg-white/10 file:px-3 file:py-1.5 file:text-white file:hover:bg-white/20"
        />
        {uploadPreview && (
          <div className="mt-3">
            <img
              src={uploadPreview}
              alt="Firma seleccionada"
              className="h-24 rounded-md border border-white/15 bg-white object-contain"
            />
          </div>
        )}
        <div className="mt-1 text-xs text-slate-300">
          Se aceptan PNG/JPG. La imagen se convertirá a base64 y se enviará como soporte de firma.
        </div>
      </div>

      {/* Aceptación */}
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          className="h-4 w-4 accent-blue-600"
          checked={!!acepta}
          onChange={(e) => setAcepta(e.target.checked)}
        />
        He leído y autorizo el contenido de este formato.
      </label>
    </div>
  );
}

/* =================== Wizard =================== */
export default function ConsentWizard({ show, studyId, onDone, onCancel }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Firmas persistentes para los 3 pasos
  const [firmaDraw, setFirmaDraw] = useState(null);
  const [firmaUploadB64, setFirmaUploadB64] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);

  const [acepta, setAcepta] = useState(false);
  const [datos, setDatos] = useState({
    nombre: "", cc: "", fechaExp: "", lugarExp: "", ciudadFirma: "",
    dia: "", mes: "", anio: "", email: "", celular: "", direccion: "",
  });

  const totalSteps = 3;
  const pct = useMemo(() => ((step - 1) / (totalSteps - 1)) * 100, [step, totalSteps]);

  // Prefill datos del candidato
  useEffect(() => {
    if (!show || !studyId) return;
    (async () => {
      try {
        const { data } = await api.get(`/api/estudios/${studyId}/`);
        const c = data?.candidato || {};
        setDatos((s) => ({
          ...s,
          nombre: [c.nombre, c.apellido].filter(Boolean).join(" ") || s.nombre,
          cc: c.cedula || s.cc,
          email: c.email || s.email,
          celular: c.celular || s.celular,
          direccion: c.direccion || s.direccion,
          ciudadFirma: c.ciudad_residencia || s.ciudadFirma,
        }));
      } catch {}
    })();
  }, [show, studyId]);

  // Bloquear scroll del body
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => (document.body.style.overflow = prev || "");
  }, [show]);

  // Limpieza de objectURL si cambia/termina
  useEffect(() => () => { if (uploadPreview) URL.revokeObjectURL(uploadPreview); }, [uploadPreview]);

  if (!show) return null;

  const requiredOk = () => {
    if (!acepta) { alert("Debes aceptar el contenido."); return false; }
    if (!firmaDraw) { alert("Debes dibujar tu firma para continuar."); return false; }
    if (!firmaUploadB64) { alert("Debes subir la imagen de tu firma para continuar."); return false; }
    return true;
  };

  const next = async () => {
    if (!requiredOk()) return;
    setSaving(true);
    try {
      await api.post(`/api/estudios/${studyId}/firmar_consentimiento/`, {
      tipo: CONSENT_TYPES[step],
      acepta: true,
      firma_draw_base64:   firmaDraw,        // ✅ coincide con el backend
      firma_upload_base64: firmaUploadB64,   // ✅ coincide con el backend
      user_agent: navigator.userAgent,
    });

      if (step < totalSteps) {
        setStep((s) => s + 1);
        setAcepta(false); // se vuelve a marcar en cada paso
        // NO limpiamos firmaDraw / firmaUploadB64: consistencia entre pasos
      } else {
        if (uploadPreview) URL.revokeObjectURL(uploadPreview);
        setUploadPreview(null);
        setFirmaDraw(null);
        setFirmaUploadB64(null);
        onDone?.();
      }
    } catch (e) {
      const msg = e?.response?.data?.detail || "No se pudo registrar la firma.";
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const cancelar = () => { onCancel?.(); };

  return (
    <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="absolute inset-0 bg-black/70" onClick={cancelar} />
      <div className="absolute left-1/2 top-[6vh] -translate-x-1/2 w-[min(92vw,900px)]">
        <div
          className="max-h-[84vh] overflow-auto rounded-2xl border border-white/10 bg-slate-900/95 p-6 text-slate-100 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-500/20 text-amber-400">🤝</span>
              <h2 id="consent-title" className="text-xl font-semibold">Consentimientos</h2>
            </div>
            <span className="rounded-lg border border-white/10 bg-slate-800/70 px-3 py-1 text-xs text-slate-300">
              Flujo obligatorio
            </span>
          </div>

          <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
            <span>Paso {step} de {totalSteps}</span>
          </div>
          <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-slate-700/50">
            <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>

          <TextConsentStep
            step={step}
            datos={datos}
            setDatos={setDatos}
            firmaDraw={firmaDraw}
            setFirmaDraw={setFirmaDraw}
            firmaUploadB64={firmaUploadB64}
            setFirmaUploadB64={setFirmaUploadB64}
            uploadPreview={uploadPreview}
            setUploadPreview={setUploadPreview}
            acepta={acepta}
            setAcepta={setAcepta}
          />

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancelar}
              className="cursor-not-allowed rounded-lg border border-white/10 bg-slate-800/70 px-4 py-2 text-sm text-slate-400"
              disabled
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={next}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {step < totalSteps ? "Continuar" : "Finalizar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
