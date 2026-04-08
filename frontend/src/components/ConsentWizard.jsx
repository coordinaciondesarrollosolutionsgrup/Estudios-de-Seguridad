import { useEffect, useMemo, useRef, useState, memo } from "react";
import api from "../api/axios";

const CONSENT_TYPES = { 1: "GENERAL", 2: "CENTRALES", 3: "ACADEMICO" };

const STEP_META = {
  1: {
    title: "Autorizacion general de tratamiento de datos",
    subtitle: "Estudio de seguridad y validacion de informacion personal",
    chip: "General",
    chipClass: "bg-blue-500/15 text-blue-200 border-blue-400/25",
  },
  2: {
    title: "Autorizacion consulta en centrales de riesgo",
    subtitle: "Validacion financiera para proceso de vinculacion",
    chip: "Centrales",
    chipClass: "bg-emerald-500/15 text-emerald-200 border-emerald-400/25",
  },
  3: {
    title: "Autorizacion verificacion academica",
    subtitle: "Confirmacion de titulos y certificados del candidato",
    chip: "Academico",
    chipClass: "bg-violet-500/15 text-violet-200 border-violet-400/25",
  },
};

function SignatureCanvas({ onChange, className = "", width = 520, height = 160 }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const pathLenRef = useRef(0);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const ratio = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    c.width = width * ratio;
    c.height = height * ratio;
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    c.style.background = "#fff";
  }, [width, height]);

  const pos = (e) => {
    const c = ref.current;
    const r = c.getBoundingClientRect();
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
    const MIN_PX = 12;
    if (pathLenRef.current >= MIN_PX) {
      onChange?.(ref.current.toDataURL("image/png"));
      return;
    }
    const c = ref.current;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    onChange?.(null);
  };

  const clear = () => {
    const c = ref.current;
    const ctx = c.getContext("2d");
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
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
      <button
        type="button"
        onClick={clear}
        className="mt-2 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-800/70 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700/70"
      >
        Limpiar firma
      </button>
    </div>
  );
}

const LineInput = memo(function LineInput({ value, onCommit, placeholder, className = "min-w-[180px]" }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => {
    setV(value ?? "");
  }, [value]);
  const commit = () => onCommit?.(v);
  const onKey = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    commit();
    e.currentTarget.blur();
  };
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

const fileToDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

function TextConsentStep({
  step,
  datos,
  setDatos,
  setFirmaDraw,
  setFirmaUploadB64,
  uploadPreview,
  setUploadPreview,
  acepta,
  setAcepta,
}) {
  const Hoja = ({ children }) => (
    <div className="rounded-xl border border-white/10 bg-slate-800/65 p-4 leading-relaxed text-slate-100 text-sm space-y-3">
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

    const objectUrl = URL.createObjectURL(f);
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadPreview(objectUrl);

    try {
      const dataUrl = await fileToDataURL(f);
      setFirmaUploadB64(dataUrl);
    } catch {
      setFirmaUploadB64(null);
    }
  };

  const paso1 = (
    <Hoja>
      <h3 className="text-base font-semibold">FORMATO DE AUTORIZACION DE DATOS PERSONALES</h3>
      <p>
        Yo,
        <LineInput value={datos.nombre} onCommit={C("nombre")} placeholder="Nombres y apellidos" />, mayor de edad,
        identificado(a) con cedula de ciudadania No.
        <LineInput value={datos.cc} onCommit={C("cc")} placeholder="CC" className="min-w-[120px]" />, expedida en
        <LineInput value={datos.lugarExp} onCommit={C("lugarExp")} placeholder="Ciudad" className="min-w-[130px]" />,
        otorgo autorizacion libre e informada para validar mi informacion personal dentro del estudio de seguridad.
      </p>
      <p>
        Esta autorizacion incluye consulta y verificacion en bases publicas y privadas, listas restrictivas,
        instituciones educativas y centrales de riesgo, conforme a la normatividad colombiana vigente.
      </p>
      <p>
        En constancia, firmo en
        <LineInput value={datos.ciudadFirma} onCommit={C("ciudadFirma")} placeholder="Ciudad" />, a los
        <LineInput value={datos.dia} onCommit={C("dia")} placeholder="dia" className="w-12" /> dias del mes de
        <LineInput value={datos.mes} onCommit={C("mes")} placeholder="mes" className="w-24" /> del ano
        <LineInput value={datos.anio} onCommit={C("anio")} placeholder="20__" className="w-16" />.
      </p>
    </Hoja>
  );

  const paso2 = (
    <Hoja>
      <h3 className="text-base font-semibold">FORMATO DE AUTORIZACION CONSULTA EN CENTRALES DE RIESGO</h3>
      <p>
        Yo,
        <LineInput value={datos.nombre} onCommit={C("nombre")} placeholder="Nombres y apellidos" />, identificado(a)
        con cedula de ciudadania No.
        <LineInput value={datos.cc} onCommit={C("cc")} placeholder="CC" className="min-w-[120px]" />, autorizo la
        consulta de mi informacion crediticia ante centrales de riesgo para evaluacion del proceso.
      </p>
      <p>
        Autorizo su uso exclusivo para fines de analisis y verificacion dentro del estudio, con tratamiento responsable
        y protegido de mis datos.
      </p>
      <p>
        En constancia, firmo en
        <LineInput value={datos.ciudadFirma} onCommit={C("ciudadFirma")} placeholder="Ciudad" />, a los
        <LineInput value={datos.dia} onCommit={C("dia")} placeholder="dia" className="w-12" /> dias del mes de
        <LineInput value={datos.mes} onCommit={C("mes")} placeholder="mes" className="w-24" /> del ano
        <LineInput value={datos.anio} onCommit={C("anio")} placeholder="20__" className="w-16" />.
      </p>
    </Hoja>
  );

  const paso3 = (
    <Hoja>
      <h3 className="text-base font-semibold">FORMATO DE AUTORIZACION VERIFICACION ACADEMICA</h3>
      <p>
        Yo,
        <LineInput value={datos.nombre} onCommit={C("nombre")} placeholder="Nombres y apellidos" />, con cedula No.
        <LineInput value={datos.cc} onCommit={C("cc")} placeholder="CC" className="min-w-[120px]" />, expedida en
        <LineInput value={datos.lugarExp} onCommit={C("lugarExp")} placeholder="Ciudad" className="min-w-[130px]" />,
        autorizo la verificacion de titulos, certificados y soportes academicos con las entidades correspondientes.
      </p>
      <p>
        Esta validacion se realiza para confirmar la autenticidad y consistencia de la informacion academica aportada
        durante el proceso.
      </p>
      <p>
        En constancia, firmo en
        <LineInput value={datos.ciudadFirma} onCommit={C("ciudadFirma")} placeholder="Ciudad" />, a los
        <LineInput value={datos.dia} onCommit={C("dia")} placeholder="dia" className="w-12" /> dias del mes de
        <LineInput value={datos.mes} onCommit={C("mes")} placeholder="mes" className="w-24" /> del ano
        <LineInput value={datos.anio} onCommit={C("anio")} placeholder="20__" className="w-16" />.
      </p>
    </Hoja>
  );

  return (
    <div className="space-y-4">
      {step === 1 ? paso1 : step === 2 ? paso2 : paso3}

      <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        Requisito obligatorio: dibuja tu firma y sube una imagen de tu firma para continuar.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-1 text-sm font-medium text-slate-200">1) Dibuja tu firma</div>
          <SignatureCanvas
            onChange={(dataUrl) => {
              const ok = dataUrl && dataUrl.startsWith("data:image") && dataUrl.length > 100;
              setFirmaDraw(ok ? dataUrl : null);
            }}
            width={520}
            height={160}
          />
        </div>

        <div className="rounded-xl border border-white/15 bg-slate-800/70 p-3">
          <div className="mb-1 text-sm font-medium text-slate-200">2) Sube imagen de firma</div>
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
          <div className="mt-2 text-xs text-slate-300">
            Formatos permitidos: PNG y JPG.
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          className="h-4 w-4 accent-blue-600"
          checked={!!acepta}
          onChange={(e) => setAcepta(e.target.checked)}
        />
        He leido y autorizo el contenido de este formato.
      </label>
    </div>
  );
}

export default function ConsentWizard({ show, studyId, onDone, onCancel }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [firmaDraw, setFirmaDraw] = useState(null);
  const [firmaUploadB64, setFirmaUploadB64] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);

  const [acepta, setAcepta] = useState(false);
  const [datos, setDatos] = useState({
    nombre: "",
    cc: "",
    fechaExp: "",
    lugarExp: "",
    ciudadFirma: "",
    dia: "",
    mes: "",
    anio: "",
    email: "",
    celular: "",
    direccion: "",
  });

  const totalSteps = 3;
  const pct = useMemo(() => ((step - 1) / (totalSteps - 1)) * 100, [step, totalSteps]);
  const meta = STEP_META[step] || STEP_META[1];

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
      } catch {
        // noop
      }
    })();
  }, [show, studyId]);

  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, [show]);

  useEffect(
    () => () => {
      if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    },
    [uploadPreview]
  );

  if (!show) return null;

  const requiredOk = () => {
    if (!acepta) {
      alert("Debes aceptar el contenido.");
      return false;
    }
    if (!firmaDraw) {
      alert("Debes dibujar tu firma para continuar.");
      return false;
    }
    if (!firmaUploadB64) {
      alert("Debes subir la imagen de tu firma para continuar.");
      return false;
    }
    return true;
  };

  const downloadCurrentPdf = async () => {
    if (!studyId) return;
    setDownloading(true);
    try {
      const tipo = CONSENT_TYPES[step];
      const { data, headers } = await api.get(`/api/estudios/${studyId}/consentimientos/pdf/?tipo=${tipo}`, {
        responseType: "blob",
      });
      const blob = new Blob([data], { type: headers?.["content-type"] || "application/pdf" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `Formato_${tipo}_Estudio_${studyId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      const detail = e?.response?.data?.detail || "No fue posible descargar el PDF en este momento.";
      alert(detail);
    } finally {
      setDownloading(false);
    }
  };

  const next = async () => {
    if (!requiredOk()) return;
    setSaving(true);
    try {
      await api.post(`/api/estudios/${studyId}/firmar_consentimiento/`, {
        tipo: CONSENT_TYPES[step],
        acepta: true,
        firma_draw_base64: firmaDraw,
        firma_upload_base64: firmaUploadB64,
        user_agent: navigator.userAgent,
      });

      if (step < totalSteps) {
        setStep((s) => s + 1);
        setAcepta(false);
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

  return (
    <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm" onClick={onCancel} />

      <div className="absolute left-1/2 top-[4vh] -translate-x-1/2 w-[min(94vw,980px)]">
        <div
          className="max-h-[88vh] overflow-auto rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-[#0b1530]/95 p-6 text-slate-100 shadow-[0_20px_80px_rgba(2,8,23,0.75)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-300">
                Paso {step} de {totalSteps}
              </div>
              <h2 id="consent-title" className="text-xl font-semibold tracking-tight">
                {meta.title}
              </h2>
              <p className="mt-1 text-sm text-slate-300">{meta.subtitle}</p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${meta.chipClass}`}>
                {meta.chip}
              </span>
              <button
                type="button"
                onClick={downloadCurrentPdf}
                disabled={downloading}
                className="rounded-lg border border-sky-400/30 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-500/25 disabled:opacity-60"
              >
                {downloading ? "Descargando..." : "Descargar PDF de este formato"}
              </button>
            </div>
          </div>

          <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-slate-700/50">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>

          <TextConsentStep
            step={step}
            datos={datos}
            setDatos={setDatos}
            setFirmaDraw={setFirmaDraw}
            setFirmaUploadB64={setFirmaUploadB64}
            uploadPreview={uploadPreview}
            setUploadPreview={setUploadPreview}
            acepta={acepta}
            setAcepta={setAcepta}
          />

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={next}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {saving ? "Guardando..." : step < totalSteps ? "Firmar y continuar" : "Finalizar y enviar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
