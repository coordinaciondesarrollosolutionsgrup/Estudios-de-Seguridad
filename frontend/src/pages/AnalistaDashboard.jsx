import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import NotificacionesBell from "../components/NotificacionesBell";
import ThreeBackground from "../components/ThreeBackground";
import { useToast } from "../components/Toast";

// Paginación para lista de estudios
const PAGE_SIZE = 10;

/* --------------------- UI helpers --------------------- */
const Badge = ({ color = "slate", children }) => {
  const map = {
    gray: "bg-white/10 text-white ring-white/15",
    blue: "bg-blue-500/15 text-blue-200 ring-blue-400/25",
    green: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/25",
    amber: "bg-amber-500/15 text-amber-200 ring-amber-400/25",
    slate: "bg-slate-500/15 text-slate-200 ring-slate-400/25",
    red: "bg-rose-500/15 text-rose-200 ring-rose-400/25",
    violet: "bg-violet-500/15 text-violet-200 ring-violet-400/25",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${map[color] || map.gray}`}>
      {children}
    </span>
  );
};

const estadoColor = (estado) => {
  const e = (estado || "").toUpperCase();
  switch (e) {
    case "VALIDADO": return "green";
    case "HALLAZGO": return "amber";
    case "OBSERVADO": return "amber";
    case "EN_VALIDACION": return "blue";
    case "PENDIENTE": return "violet";
    case "EN_CAPTURA": return "violet";
    case "EN_REVISION": return "blue";
    case "DEVUELTO": return "amber";
    case "CERRADO": return "slate";
    default: return "gray";
  }
};

const riesgoColor = (nivel) => {
  const n = (nivel || "").toUpperCase();
  switch (n) {
    case "BAJO": return "green";
    case "MEDIO": return "amber";
    case "ALTO": return "red";
    case "CRITICO": return "red";
    default: return "gray";
  }
};

// Visible: si está VALIDADO y tiene comentario/irregularidad => OBSERVADO
const estadoVisible = (it) => {
  const hasObs = !!(it?.comentario || it?.irregularidad);
  const isValidado = (it?.estado || "").toUpperCase() === "VALIDADO";
  if (isValidado && hasObs) return { label: "OBSERVADO", color: "amber" };
  return { label: it?.estado || "—", color: estadoColor(it?.estado) };
};

/* Mini barra de progreso */
const MiniBar = ({ value = 0 }) => {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
      <div className="h-2 bg-blue-500/70" style={{ width: `${v}%` }} />
    </div>
  );
};

/* --------------------- archivos protegidos --------------------- */
const isLocalUrl = (href) => {
  if (!href) return false;
  try {
    const u = new URL(href, window.location.origin);
    return u.origin === window.location.origin;
  } catch {
    return href.startsWith("/") || href.startsWith("media/");
  }
};

const openProtected = async (url, filename = "archivo") => {
  try {
    const { data, headers } = await api.get(url, { responseType: "blob" });
    const type = headers?.["content-type"] || "application/octet-stream";
    const blob = new Blob([data], { type });
    const objectUrl = URL.createObjectURL(blob);
    const w = window.open(objectUrl, "_blank", "noopener");
    if (!w) {
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
};

/* --------------------- helpers visuales/datos --------------------- */
const valueOrDash = (v) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") {
    const s = v.trim();
    return s ? s : "—";
  }
  return String(v);
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

const titleCase = (s) =>
  valueOrDash(String(s || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()));

/** Normaliza los soportes del candidato (array o dict del back) -> array [{id,nombre,url}] */
const normalizeSoportes = (s) => {
  if (!s) return [];
  if (Array.isArray(s)) {
    return s
      .map((d, i) => ({
        id: d.id || i,
        nombre: d.nombre || d.tipo || "archivo",
        url: d.url || d.archivo,
        creado: d.creado,
      }))
      .filter((d) => !!d.url);
  }
  if (typeof s === "object") {
    return Object.entries(s)
      .filter(([, url]) => !!url)
      .map(([tipo, url], i) => ({
        id: i,
        nombre: titleCase(tipo),
        url,
      }));
  }
  return [];
};

/* $$$ helpers dinero / sí-no para Patrimonio $$$ */
const money = (n) =>
  typeof n === "number" ? n.toLocaleString() :
  (n && !isNaN(Number(n))) ? Number(n).toLocaleString() : "—";

const yesNo = (v) => (v === true ? "Sí" : v === false ? "No" : "—");

/* =======================================================
   PANEL DEL ANALISTA – v6 (tabs Referencias y Patrimonio)
   ======================================================= */
export default function AnalistaDashboard() {
  const [estudios, setEstudios] = useState([]);
  // Paginación de estudios
  const [estudiosPage, setEstudiosPage] = useState(1);
  const totalEstudiosPages = Math.ceil(estudios.length / PAGE_SIZE);
  const estudiosPaginados = estudios.slice((estudiosPage - 1) * PAGE_SIZE, estudiosPage * PAGE_SIZE);

  const [f, setF] = useState({ estado: "", desde: "", hasta: "", cedula: "", empresa: "" });
  // Empresas únicas para el filtro
  const empresas = useMemo(() => {
    const set = new Set();
    estudios.forEach((e) => {
      // Intenta obtener empresa de varias ubicaciones posibles
      let empresa = e.empresa || e.empresa_nombre || e.candidato?.empresa || e.solicitud?.empresa_nombre || e.solicitud?.empresa;
      if (empresa && typeof empresa === 'object') {
        empresa = empresa.nombre || empresa.id || JSON.stringify(empresa);
      }
      if (empresa) set.add(String(empresa));
    });
    return Array.from(set);
  }, [estudios]);
  const toast = useToast();
  const [sel, setSel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [invitando, setInvitando] = useState(false);
  const [devolviendo, setDevolviendo] = useState(false);

  // “Ampliar detalle”
  const [wide, setWide] = useState(false);

  // Centrales
  const [centrales, setCentrales] = useState([]);
  const centralesInputRef = useRef(null);
  const [centralesBusy, setCentralesBusy] = useState(false);

  // ➕ Referencias
  const [refs, setRefs] = useState({ laborales: [], personales: [] });
  const [savingRefs, setSavingRefs] = useState(false);

  // Tabs
  const [tab, setTab] = useState("CANDIDATO");

  // Listas restrictivas (antecedentes)
  const [archivosRestrictivas, setArchivosRestrictivas] = useState([]);
  const [subiendoRestrictiva, setSubiendoRestrictiva] = useState(false);

  const loadReferencias = async (id) => {
    try {
      const { data } = await api.get(`/api/estudios/${id}/referencias/`);
      if (data && (data.laborales || data.personales)) {
        setRefs({
          laborales: Array.isArray(data.laborales) ? data.laborales : [],
          personales: Array.isArray(data.personales) ? data.personales : [],
        });
      } else {
        setRefs({ laborales: [], personales: [] });
      }
    } catch {
      try {
        const { data } = await api.get(`/api/referencias/?estudio=${id}`);
        const norm = (Array.isArray(data) ? data : []).map((r) => ({
          nombres: r?.nombres || "",
          apellidos: r?.apellidos || "",
          telefono: r?.telefono || "",
          relacion: r?.relacion || "",
          comentario: r?.comentario || "",
        }));
        const laborales = norm.slice(0, 3);
        const personales = norm.slice(3, 6);
        setRefs({
          laborales: laborales.map((r) => ({ funcionario: r.nombres, cargo: r.relacion })),
          personales: personales.map((r) => ({ nombre: [r.nombres, r.apellidos].filter(Boolean).join(" "), familiar: r.relacion })),
        });
      } catch {
        setRefs({ laborales: [], personales: [] });
      }
    }
  };

  const saveReferencias = async () => {
    if (!sel?.id) return;
    const payload = {
      laborales: (refs.laborales || []).filter((r) => r.funcionario || r.cargo).slice(0, 3),
      personales: (refs.personales || []).filter((r) => r.nombre || r.familiar).slice(0, 3),
    };
    setSavingRefs(true);
    try {
      await api
        .post(`/api/estudios/${sel.id}/referencias_set/`, payload)
        .catch(() => api.post(`/api/estudios/${sel.id}/referencias/`, payload))
        .catch(() => api.patch(`/api/estudios/${sel.id}/`, { referencias: payload }));
      await loadReferencias(sel.id);
      toast.success("✓ Referencias guardadas.");
    } catch {
      toast.error("No se pudieron guardar las referencias.");
    } finally {
      setSavingRefs(false);
    }
  };

  // pin de progreso (nunca baja)
  const progressPinRef = useRef({});
  const [, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);

  const pinProgress = (id, value) => {
    if (!id) return 0;
    const prev = Number(progressPinRef.current[id] || 0);
    const next = Math.max(prev, Number(value || 0));
    if (next !== prev) {
      progressPinRef.current[id] = next;
      bump();
    }
    return progressPinRef.current[id];
  };

  const getPinned = (id, fallback) =>
    Math.max(Number(fallback || 0), Number(progressPinRef.current[id] || 0));

  const inputClass =
    "rounded-xl border border-white/10 bg-white/10 text-white placeholder-white/40 p-2 text-sm outline-none focus:border-white/30 focus:ring-0";

  const buttonPrimary =
    "rounded-xl bg-blue-600/90 hover:bg-blue-600 text-white px-3 py-2 text-sm transition";

  const buttonGhost =
    "rounded-xl border border-white/10 hover:bg-white/5 px-3 py-2 text-sm";

  const stampPinsFromList = (rows) => rows.forEach((e) => pinProgress(e.id, e.progreso || 0));

  const openFromQuery = (lista) => {
    const sp = new URLSearchParams(window.location.search);
    const openSolicitud = sp.get("open");
    if (openSolicitud) {
      const f = lista.find((e) => String(e.solicitud_id) === String(openSolicitud));
      return f?.id;
    }
    return lista[0]?.id;
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.estado) params.set("estado", f.estado);
      if (f.desde) params.set("desde", f.desde);
      if (f.hasta) params.set("hasta", f.hasta);
      if (f.cedula) params.set("cedula", f.cedula);
      if (f.empresa) params.set("empresa", f.empresa);
      const { data } = await api.get(`/api/estudios/?${params.toString()}`);
      const rows = Array.isArray(data) ? data : [];
      setEstudios(rows);
      stampPinsFromList(rows);
      if (rows.length) {
        const idToOpen = openFromQuery(rows);
        if (idToOpen) openEstudio(idToOpen);
      } else {
        setSel(null);
        setCentrales([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadCentrales = async (id) => {
    try {
      const { data } = await api.get(`/api/estudios/${id}/documentos/?categoria=CENTRALES`);
      setCentrales(Array.isArray(data) ? data : []);
    } catch {
      setCentrales([]);
    }
  };

  const openEstudio = async (id) => {
    try {
      const [{ data }, bioRes] = await Promise.allSettled([
        api.get(`/api/estudios/${id}/`),
        api.get(`/api/estudios/${id}/candidato_bio/`),
      ]).then(([main, bio]) => [
        main.status === "fulfilled" ? main.value : { data: null },
        bio.status === "fulfilled" ? bio.value : { data: null },
      ]);

      if (!data) throw new Error("No se pudo cargar el estudio");

      // Candidato base del endpoint principal
      let candidato = data?.candidato || data?.solicitud?.candidato || null;

      // Merge con el bio completo (incluye informacion_familiar, descripcion_vivienda, foto_url, soportes…)
      const bio = bioRes?.data || null;
      if (bio) {
        candidato = { ...(candidato || {}), ...bio };
      }

      // Asegura foto_url consistente
      if (candidato) {
        const fotoUrl = candidato.foto_url || candidato.foto || candidato.foto?.url || null;
        candidato = { ...candidato, foto_url: fotoUrl };
      }

      // Guarda el detalle con candidato normalizado
      setSel({ ...data, candidato });

      pinProgress(id, data.progreso || 0);
      await loadCentrales(id);
      await loadReferencias(id);
      setTab("CANDIDATO");
    } catch {
      setSel(null);
      setCentrales([]);
      setRefs({ laborales: [], personales: [] });
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  // Cargar archivos de antecedentes para el estudio seleccionado
  useEffect(() => {
    if (!sel?.id) return;
    (async () => {
      try {
        const { data } = await api.get(`/api/estudios/${sel.id}/documentos/?tipo=ANTECEDENTES`);
        setArchivosRestrictivas(Array.isArray(data) ? data : []);
      } catch {
        setArchivosRestrictivas([]);
      }
    })();
  }, [sel?.id]);

  /* --------------------- acciones globales --------------------- */
  const invitarCandidato = async () => {
    if (!sel?.solicitud_id) return;
    setInvitando(true);
    const tid = toast.loading("Enviando invitación al candidato…");
    try {
      await api.post(`/api/solicitudes/${sel.solicitud_id}/invitar_candidato/`);
      toast.update(tid, "success", "✓ Invitación enviada al candidato.");
    } catch (e) {
      const detail = e?.response?.data?.detail || "No se pudo enviar la invitación.";
      toast.update(tid, "error", detail);
    } finally {
      setInvitando(false);
    }
  };

  // Estado para modal de devolución
  const [devolverModal, setDevolverModal] = useState({ open: false, obs: "", busy: false });

  const abrirDevolver = () => setDevolverModal({ open: true, obs: "", busy: false });

  const confirmarDevolver = async () => {
    if (!sel || !devolverModal.obs.trim()) return;
    setDevolverModal((s) => ({ ...s, busy: true }));
    setDevolviendo(true);
    const tid = toast.loading("Devolviendo estudio al candidato…");
    try {
      await api.post(`/api/estudios/${sel.id}/devolver/`, { observacion: devolverModal.obs.trim() });
      toast.update(tid, "success", "✓ Estudio devuelto al candidato.");
      setDevolverModal({ open: false, obs: "", busy: false });
      await openEstudio(sel.id);
    } catch (e) {
      const detail = e?.response?.data?.detail || "No se pudo devolver el estudio.";
      toast.update(tid, "error", detail);
      setDevolverModal((s) => ({ ...s, busy: false }));
    } finally {
      setDevolviendo(false);
    }
  };

  const devolver = abrirDevolver;

  const [modal, setModal] = useState({
    open: false,
    mode: "OBS",
    decision: null,
    text: "",
    busy: false,
  });

  const openObs = () =>
    setModal({
      open: true,
      mode: "OBS",
      decision: null,
      text: sel?.observacion_analista || "",
      busy: false,
    });

  const openDecidir = (d) =>
    setModal({ open: true, mode: "DECIDIR", decision: d, text: "", busy: false });

  const submitModal = async () => {
    if (!sel) return;
    setModal((m) => ({ ...m, busy: true }));
    try {
      if (modal.mode === "OBS") {
        await api.post(`/api/estudios/${sel.id}/observacion/`, { observacion: modal.text });
      }
      if (modal.mode === "DECIDIR") {
        await api.post(`/api/estudios/${sel.id}/decidir/`, {
          decision: modal.decision,
          observacion: modal.text || "",
        });
      }
      await openEstudio(sel.id);
      setModal({ open: false, mode: "OBS", decision: null, text: "", busy: false });
    } finally {
      setModal((m) => ({ ...m, busy: false }));
    }
  };

  // helpers
  const getItemsBy = (predicate) => (sel?.items || []).filter(predicate);

  const isClosed =
    (sel?.estado || "").toUpperCase() === "CERRADO" || Boolean(sel?.finalizado_at);

  const selectedProgress = useMemo(
    () => getPinned(sel?.id, sel?.progreso || 0),
    [sel]
  );

  const titleFor = (tipo) => {
    const t = (tipo || "").toUpperCase();
    if (t === "TITULOS_ACADEMICOS" || t === "ACADEMICO") return "🎓 ACADÉMICO";
    if (t === "CERT_LABORALES" || t === "LABORAL") return "💼 LABORAL";
    if (t === "INFO_ECONOMICA" || t === "ECONOMICA") return "📊 INFORMACIÓN ECONÓMICA";
    if (t === "VISITA_DOMICILIARIA") return "🖼️ ANEXOS FOTOGRÁFICOS";
    if (t === "CENTRALES" || t === "LISTAS_RESTRICTIVAS") return "🏦 CENTRALES";
    return "📄 DOCS";
  };

  /* --------------------- subcomponentes --------------------- */
  const Box = ({ title, right, children }) => (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="font-semibold">{title}</div>
        {right}
      </div>
      <div>{children}</div>
    </div>
  );

  const ListDocs = ({ docs }) => (
    <ul className="list-disc pl-5 text-sm">
      {(docs || []).length ? (
        docs.map((d) => {
          const href = d.url || d.archivo || d.archivo_url;
          const name = d.nombre || "archivo";
          const onClick = (ev) => {
            if (href && isLocalUrl(href)) {
              ev.preventDefault();
              openProtected(href, name);
            }
          };
          return (
            <li key={d.id || href}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                onClick={onClick}
                className="text-blue-300 underline hover:text-blue-200"
              >
                {name}
              </a>
              {d.creado && (
                <span className="text-white/50"> · {new Date(d.creado).toLocaleString()}</span>
              )}
            </li>
          );
        })
      ) : (
        <li className="text-white/60">Sin documentos</li>
      )}
    </ul>
  );

  /* ---------- TAB: CANDIDATO (bio + consentimientos + soportes) ---------- */
  const L = ({ label, value }) => (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/70">{label}</span>
      <span className="text-white/90">{valueOrDash(value)}</span>
    </div>
  );

  const ConsentimientosMini = () => {
    const cons = sel?.consentimientos || [];
    if (!cons.length) return <div className="text-sm text-white/60">Sin registros</div>;

    const pick = (obj, keys) => {
      for (let i = 0; i < keys.length; i++) {
        const v = obj && obj[keys[i]];
        if (v) return v;
      }
      return null;
    };

    const SigThumb = ({ src, label }) => {
      if (!src) return null;
      const isData = typeof src === "string" && src.indexOf("data:") === 0;
      const img = (
        <img
          src={src}
          alt={label}
          className="h-full w-full object-contain"
          loading="lazy"
          decoding="async"
        />
      );

      const click = (e) => {
        if (!isData && isLocalUrl(src)) {
          e.preventDefault();
          openProtected(src, label || "firma");
        }
      };

      return (
        <div className="w-28 h-20 rounded-md border border-white/10 bg-white p-1 shadow-sm">
          {isData ? img : (
            <a href={src} target="_blank" rel="noreferrer" onClick={click}>
              {img}
            </a>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-3">
        {cons.map((c) => {
          const combinedSrc = pick(c, ["firma_url", "firma_combinada_url"]);
          const drawnSrc = pick(c, [
            "firma_dibujo_url",
            "firma_canvas_url",
            "firma_base64",
            "firma_b64",
          ]);
          const uploadSrc = pick(c, [
            "firma_imagen_url",
            "firma_upload_url",
            "firma_archivo_url",
            "soporte_url",
            "firma_imagen_base64",
            "firma_upload_base64",
          ]);

          return (
            <div key={c.id} className="rounded-xl border border-white/10 bg-white/5 p-2">
              <div className="text-xs font-semibold">
                {String(c.tipo || "").toUpperCase()} · {c.aceptado ? "Aceptado" : "Pendiente"}
                {c.firmado_at && (
                  <span className="text-white/60"> · {new Date(c.firmado_at).toLocaleString()}</span>
                )}
              </div>
              {(combinedSrc || drawnSrc || uploadSrc) ? (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {combinedSrc && (
                    <div className="space-y-1 text-[11px] text-white/70">
                      <div>Firma combinada</div>
                      <SigThumb src={combinedSrc} label="Firma (combinada)" />
                    </div>
                  )}
                  {drawnSrc && (
                    <div className="space-y-1 text-[11px] text-white/70">
                      <div>Firma (dibujo)</div>
                      <SigThumb src={drawnSrc} label="Firma dibujada" />
                    </div>
                  )}
                  {uploadSrc && (
                    <div className="space-y-1 text-[11px] text-white/70">
                      <div>Firma subida</div>
                      <SigThumb src={uploadSrc} label="Firma subida" />
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const TabCandidato = () => {
    const c = sel?.candidato || sel?.solicitud?.candidato || {};

    const fullName = [c.nombre, c.apellido].filter(Boolean).join(" ");
    const tipoDoc = c.tipo_documento_label || c.tipo_documento;
    const municipio = c.municipio_nombre || c.municipio;
    const departamento = c.departamento_nombre || c.departamento;
    const eps = c.eps_nombre || c.eps;
    const pension = c.pension_fondo_nombre || c.pension_fondo;
    const caja = c.caja_compensacion_nombre || c.caja_compensacion;
    const cesantias = c.cesantias_fondo_nombre || c.cesantias_fondo;
    const estrato = c.estrato_label || c.estrato;
    const tipoZona = c.tipo_zona_label || c.tipo_zona;

    const soportesDocs = normalizeSoportes(c.soportes);
    const fotoUrl = c.foto_url || c.foto?.url || c.foto || null;

    return (
      <div className="space-y-3">
        {/* PERFIL */}
        <Box title="Perfil del candidato">
          <div className="grid md:grid-cols-[120px,1fr] gap-4 items-start">
            <div className="h-28 w-28 rounded-xl overflow-hidden bg-white/10 border border-white/10">
              {fotoUrl ? (
                <img src={fotoUrl} alt="Foto" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full grid place-items-center text-xs text-white/50">
                  Sin foto
                </div>
              )}
            </div>
            <div className="text-sm text-white/80 space-y-1">
              <div>
                <b>{valueOrDash(fullName)}</b> · {valueOrDash(c.cedula)}
              </div>
              <div>
                {valueOrDash(c.email)} {c.celular ? `· ${c.celular}` : ""}
              </div>
              <div>{valueOrDash(c.ciudad_residencia || municipio)}</div>
            </div>
          </div>
        </Box>

        {/* BIOGRAFICO */}
        <div className="grid md:grid-cols-2 gap-3">
          <Box title="Datos personales">
            <div className="space-y-2">
              <L label="Tipo/Núm. documento" value={tipoDoc ? `${tipoDoc} ${c.cedula || ""}`.trim() : c.cedula} />
              <L label="Fecha de nacimiento" value={fmtDate(c.fecha_nacimiento)} />
              <L label="Estado civil" value={c.estado_civil_label || c.estado_civil} />
              <L label="Sexo" value={c.sexo_label || c.sexo} />
              <L label="Grupo sanguíneo" value={c.grupo_sanguineo_label || c.grupo_sanguineo} />
              <L label="Fecha de expedición" value={fmtDate(c.fecha_expedicion)} />
              <L label="Lugar de expedición" value={c.lugar_expedicion} />
            </div>
          </Box>

          <Box title="Ubicación">
            <div className="space-y-2">
              <L label="Dirección" value={c.direccion} />
              <L label="Barrio" value={c.barrio} />
              <L label="Municipio" value={municipio} />
              <L label="Departamento" value={departamento} />
              <L label="Estrato" value={estrato} />
              <L label="Tipo de zona" value={tipoZona} />
              <L label="Comuna" value={c.comuna} />
            </div>
          </Box>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <Box title="Contactos">
            <div className="space-y-2">
              <L label="Celular 1" value={c.celular || c.telefono} />
              <L label="Teléfono alterno" value={c.telefono_fijo || c.telefono_alterno} />
            </div>
          </Box>

          <Box title="Seguridad social">
            <div className="space-y-2">
              <L label="EPS" value={eps} />
              <L label="Fondo de pensiones" value={pension} />
              <L label="Caja de compensación" value={caja} />
              <L label="Cesantías" value={cesantias} />
            </div>
          </Box>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <Box title="Escolaridad / Sisbén">
            <div className="space-y-2">
              <L label="Puntaje Sisbén" value={c.puntaje_sisben} />
              <L label="Grupo Sisbén" value={c.sisben || c.sisben_grupo} />
            </div>
          </Box>

          <Box title="Soportes del candidato">
            {soportesDocs.length ? (
              <ListDocs docs={soportesDocs} />
            ) : (
              <div className="text-sm text-white/60">Sin soportes.</div>
            )}
          </Box>
        </div>

        {/* CONSENTIMIENTOS (firmas) */}
        <Box title="Consentimientos (firmas)">
          <ConsentimientosMini />
        </Box>
      </div>
    );
  };

  /* ------- observación/irregularidad por módulo ------- */
  const [obsOpen, setObsOpen] = useState({});
  const [obsText, setObsText] = useState({});

  // NUEVO: obs por registro académico/laboral
  const [obsAcadOpen, setObsAcadOpen] = useState({});
  const [obsAcadText, setObsAcadText] = useState({});
  const [savingAcad, setSavingAcad] = useState({});
  const [obsLabOpen, setObsLabOpen] = useState({});
  const [obsLabText, setObsLabText] = useState({});
  const [savingLab, setSavingLab] = useState({});

  const guardarObsItem = async (itemId) => {
    const txt = (obsText[itemId] || "").trim();
    if (!txt) return;
    await api
      .post(`/api/items/${itemId}/reportar/`, { comentario: txt })
      .catch(() => api.post(`/api/estudio-items/${itemId}/reportar/`, { comentario: txt }));

    setSel((s) =>
      s
        ? { ...s, items: (s.items || []).map((it) => (it.id === itemId ? { ...it, comentario: txt } : it)) }
        : s
    );
    setObsOpen((o) => ({ ...o, [itemId]: false }));
  };

  const reportarIrregularidad = async (itemId) => {
    const motivo = prompt("Irregularidad en el módulo:");
    if (motivo === null) return;

    await api
      .post(`/api/items/${itemId}/reportar/`, { comentario: motivo })
      .catch(() => api.post(`/api/estudio-items/${itemId}/reportar/`, { comentario: motivo }));

    await api
      .patch(`/api/items/${itemId}/`, { estado: "HALLAZGO" })
      .catch(() => api.patch(`/api/estudio-items/${itemId}/`, { estado: "HALLAZGO" }))
      .catch(() => {});

    setSel((s) =>
      s
        ? {
            ...s,
            items: (s.items || []).map((it) =>
              it.id === itemId ? { ...it, estado: "HALLAZGO", irregularidad: motivo } : it
            ),
          }
        : s
    );
  };

  const validarMasivo = async (ids) => {
    if (!sel || !ids.length) return;
    try {
      await api
        .post(`/api/estudios/${sel.id}/validar_masivo/`, {
          items: ids.map((id) => ({ id, estado: "VALIDADO" })),
        })
        .catch(async () =>
          Promise.all(ids.map((id) => api.patch(`/api/estudio-items/${id}/`, { estado: "VALIDADO" })))
        );
      await openEstudio(sel.id);
    } catch {
      toast.error("No se pudo validar el ítem.");
    }
  };

  // Guardar observación de un registro académico
  const guardarObsAcademico = async (acadId) => {
    const txt = (obsAcadText[acadId] || "").trim();
    if (!txt) return;
    setSavingAcad((s) => ({ ...s, [acadId]: true }));
    try {
      await api
        .post(`/api/academicos/${acadId}/observacion/`, { comentario: txt })
        .catch(() => api.patch(`/api/academicos/${acadId}/`, { comentario_analista: txt }))
        .catch(() => api.patch(`/api/academicos/${acadId}/`, { observacion: txt }));

      setSel((s) => {
        if (!s) return s;
        const items = (s.items || []).map((it) => {
          if (!Array.isArray(it.academicos)) return it;
          const academicos = it.academicos.map((a) =>
            a.id === acadId ? { ...a, comentario_analista: txt, observacion: txt } : a
          );
          return { ...it, academicos };
        });
        return { ...s, items };
      });

      setObsAcadOpen((o) => ({ ...o, [acadId]: false }));
    } finally {
      setSavingAcad((s) => ({ ...s, [acadId]: false }));
    }
  };

  // Guardar observación de un registro laboral
  const guardarObsLaboral = async (labId) => {
    const txt = (obsLabText[labId] || "").trim();
    if (!txt) return;
    setSavingLab((s) => ({ ...s, [labId]: true }));
    try {
      await api
        .post(`/api/laborales/${labId}/observacion/`, { comentario: txt })
        .catch(() => api.patch(`/api/laborales/${labId}/`, { comentario_analista: txt }))
        .catch(() => api.patch(`/api/laborales/${labId}/`, { observacion: txt }));

      setSel((s) => {
        if (!s) return s;
        const items = (s.items || []).map((it) => {
          if (!Array.isArray(it.laborales)) return it;
          const laborales = it.laborales.map((l) =>
            l.id === labId ? { ...l, comentario_analista: txt, observacion: txt } : l
          );
          return { ...it, laborales };
        });
        return { ...s, items };
      });

      setObsLabOpen((o) => ({ ...o, [labId]: false }));
    } finally {
      setSavingLab((s) => ({ ...s, [labId]: false }));
    }
  };

  // Subir archivo de antecedentes
  const subirRestrictiva = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !sel?.id) return;
    setSubiendoRestrictiva(true);

    const form = new FormData();
    form.append("archivo", file);
    form.append("tipo", "ANTECEDENTES");
    form.append("nombre", file.name);

    try {
      await api.post(`/api/estudios/${sel.id}/documentos/`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const { data } = await api.get(`/api/estudios/${sel.id}/documentos/?tipo=ANTECEDENTES`);
      setArchivosRestrictivas(Array.isArray(data) ? data : []);
    } catch {
    } finally {
      setSubiendoRestrictiva(false);
      e.target.value = "";
    }
  };

  const TabPorTipo = ({ tipos }) => {
    const wanted = new Set(tipos.map((t) => t.toUpperCase()));
    const items = getItemsBy((it) => wanted.has((it.tipo || "").toUpperCase()));

    const [checked, setChecked] = useState({});
    const any = Object.values(checked).some(Boolean);

    const sugerencias = (t) => {
      const u = (t || "").toUpperCase();
      if (u === "LABORAL" || u === "CERT_LABORALES")
        return ["Presenta certificado laboral", "No contactan referencias", "Fechas consistentes"];
      if (u === "ACADEMICO" || u === "TITULOS_ACADEMICOS")
        return ["Título verificado", "Acta ilegible", "Falta soporte"];
      if (u === "INFO_ECONOMICA" || u === "ECONOMICA")
        return ["Sin negativos reportados", "Acuerdo de pago vigente", "Deuda significativa"];
      if (u === "VISITA_DOMICILIARIA")
        return ["Anexos completos", "Faltan fotos de cocina", "Nomenclatura no visible"];
      return ["Documentos legibles", "Pendiente validación manual"];
    };

    const sugerenciasAcad = [
      "Título verificado",
      "Acta ilegible",
      "Falta sello/registro",
      "Inconsistencia en fechas",
    ];

    const sugerenciasLab = [
      "Certificado válido",
      "Referencia no contesta",
      "Funciones no coinciden",
      "Fechas no coinciden",
    ];

    return (
      <div className="space-y-3">
        {items.map((it) => {
          const vis = estadoVisible(it);
          const tipoT = (it.tipo || "").toUpperCase();
          const docs = it.documentos || [];
          const academicos = it.academicos || [];
          const laborales = it.laborales || [];
          const economica = it.economica || [];
          const anexos = it.anexos || [];

          return (
            <Box
              key={it.id}
              title={
                <span className="flex items-center gap-2">
                  <span>{titleFor(it.tipo)}</span>
                  <Badge color={vis.color}>{vis.label}</Badge>
                </span>
              }
              right={
                !isClosed && (
                  <label className="text-xs text-white/80 flex items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-emerald-600"
                      checked={!!checked[it.id]}
                      onChange={(e) =>
                        setChecked((s) => ({ ...s, [it.id]: e.target.checked }))
                      }
                    />
                    Validar
                  </label>
                )
              }
            >
              {!isClosed && (
                <div className="mb-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => setObsOpen((o) => ({ ...o, [it.id]: !o[it.id] }))}
                    className="px-2 py-1.5 rounded-lg border border-white/15 hover:bg-white/10 text-white text-xs"
                  >
                    Observación
                  </button>
                  <button
                    onClick={() => reportarIrregularidad(it.id)}
                    className="px-2 py-1.5 rounded-lg bg-amber-600/90 hover:bg-amber-600 text-white text-xs"
                  >
                    Irregularidad
                  </button>
                </div>
              )}

              {obsOpen[it.id] && !isClosed && (
                <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-2">
                  <div className="mb-2 flex flex-wrap gap-2">
                    {sugerencias(tipoT).map((s) => (
                      <button
                        key={s}
                        onClick={() =>
                          setObsText((t) => ({
                            ...t,
                            [it.id]: (t[it.id] || "") + (t[it.id] ? "; " : "") + s,
                          }))
                        }
                        className="rounded-full px-2 py-0.5 text-xs bg-white/10 hover:bg-white/15 ring-1 ring-white/10"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    className="w-full rounded-lg border border-white/10 bg-white/10 p-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/30"
                    placeholder={`Ej.: ${titleFor(it.tipo).replace(/^[^ ]+ /, "")}: presenta certificado laboral`}
                    value={(obsText[it.id] ?? it.comentario) || ""}
                    onChange={(e) =>
                      setObsText((t) => ({ ...t, [it.id]: e.target.value }))
                    }
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={() => setObsOpen((o) => ({ ...o, [it.id]: false }))}
                      className="px-2 py-1 rounded-lg border border-white/10 text-xs hover:bg-white/10"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => guardarObsItem(it.id)}
                      className="px-2 py-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-white text-xs"
                    >
                      Guardar observación
                    </button>
                  </div>
                </div>
              )}

              {/* DOCS del módulo */}
              {docs.length > 0 && <ListDocs docs={docs} />}

              {/* ACADÉMICO */}
              {academicos.length > 0 && (
                <ul className="list-disc pl-5 text-sm">
                  {academicos.map((a) => {
                    const soporteList = [
                      ...(Array.isArray(a.soportes) ? a.soportes : []),
                      ...(Array.isArray(a.documentos) ? a.documentos : []),
                    ].map((d, i) => ({
                      id: d.id || `${a.id}-s${i}`,
                      nombre: d.nombre || d.tipo || "soporte",
                      url: d.url || d.archivo,
                    }));

                    const supportInline = [
                      a.archivo && { id: `${a.id}-principal`, nombre: "Soporte principal", url: a.archivo },
                      a.cert_antecedentes && { id: `${a.id}-ant`, nombre: "Cert. antecedentes", url: a.cert_antecedentes },
                      a.matricula_archivo && { id: `${a.id}-mat`, nombre: "Matrícula profesional", url: a.matricula_archivo },
                    ].filter(Boolean);

                    const existingComment = a.comentario_analista || a.observacion || "";

                    return (
                      <li key={a.id} className="mb-2">
                        <div className="text-white/90">
                          {a.titulo || "Título"}{a.institucion ? ` — ${a.institucion}` : ""}
                        </div>
                        <div className="text-white/60">
                          {a.fecha_graduacion || "—"}{a.ciudad ? ` · ${a.ciudad}` : ""}
                        </div>

                        {(supportInline.length + soporteList.length) > 0 ? (
                          <div className="mt-1"><ListDocs docs={[...supportInline, ...soporteList]} /></div>
                        ) : null}

                        {!isClosed && (
                          <ObsRegistro
                            open={!!obsAcadOpen[a.id]}
                            setOpen={(v) => setObsAcadOpen((o) => ({ ...o, [a.id]: v }))}
                            sugerencias={sugerenciasAcad}
                            text={obsAcadText[a.id] ?? existingComment}
                            setText={(v) => setObsAcadText((t) => ({ ...t, [a.id]: v }))}
                            onSave={() => guardarObsAcademico(a.id)}
                            saving={!!savingAcad[a.id]}
                          />
                        )}

                        {existingComment && (
                          <div className="mt-2 text-[12px] text-amber-200/90 bg-amber-500/10 border border-amber-400/20 rounded-lg px-2 py-1">
                            Nota registro: {existingComment}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* LABORAL */}
              {laborales.length > 0 && (
                <ul className="list-disc pl-5 text-sm">
                  {laborales.map((l) => {
                    const soporteList = [
                      ...(Array.isArray(l.soportes) ? l.soportes : []),
                      ...(Array.isArray(l.documentos) ? l.documentos : []),
                    ].map((d, i) => ({
                      id: d.id || `${l.id}-s${i}`,
                      nombre: d.nombre || d.tipo || "soporte",
                      url: d.url || d.archivo,
                    }));

                    const certInline = l.certificado ? [{ id: `${l.id}-cert`, nombre: "Certificado", url: l.certificado }] : [];
                    const existingComment = l.comentario_analista || l.observacion || "";

                    return (
                      <li key={l.id} className="mb-2">
                        <div className="text-white/90">
                          {l.empresa} {l.cargo ? `— ${l.cargo}` : ""}
                        </div>
                        <div className="text-white/60">
                          {l.ingreso || "—"} — {l.retiro || "—"}
                        </div>

                        {(certInline.length + soporteList.length) > 0 ? (
                          <div className="mt-1"><ListDocs docs={[...certInline, ...soporteList]} /></div>
                        ) : null}

                        {!isClosed && (
                          <ObsRegistro
                            open={!!obsLabOpen[l.id]}
                            setOpen={(v) => setObsLabOpen((o) => ({ ...o, [l.id]: v }))}
                            sugerencias={sugerenciasLab}
                            text={obsLabText[l.id] ?? existingComment}
                            setText={(v) => setObsLabText((t) => ({ ...t, [l.id]: v }))}
                            onSave={() => guardarObsLaboral(l.id)}
                            saving={!!savingLab[l.id]}
                          />
                        )}

                        {existingComment && (
                          <div className="mt-2 text-[12px] text-amber-200/90 bg-amber-500/10 border border-amber-400/20 rounded-lg px-2 py-1">
                            Nota registro: {existingComment}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* ECONÓMICA */}
              {economica.length > 0 && (
                <ul className="list-disc pl-5 text-sm">
                  {economica.map((e) => (
                    <li key={e.id}>
                      <div className="text-white/90">
                        Negativos: <b>{e.registra_negativos ? "Sí" : e.registra_negativos === false ? "No" : "—"}</b>
                        {e.central ? ` · Central: ${e.central}` : ""}
                        {e.deuda_actual != null ? ` · Deuda: $${Number(e.deuda_actual).toLocaleString()}` : ""}
                      </div>
                      {e.observaciones && <div className="text-white/60">Obs.: {e.observaciones}</div>}
                    </li>
                  ))}
                </ul>
              )}

              {/* ANEXOS VISITA */}
              {tipoT === "VISITA_DOMICILIARIA" && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {(anexos || []).length ? (
                    anexos.map((ax) => {
                      const url = ax.archivo_url || ax.archivo;
                      const onClick = (ev) => {
                        if (url && isLocalUrl(url)) {
                          ev.preventDefault();
                          openProtected(url, ax.label || ax.tipo || "anexo");
                        }
                      };
                      return (
                        <div
                          key={ax.id}
                          className="group border border-white/10 rounded-lg overflow-hidden bg-white/[0.04] hover:bg-white/[0.06] transition"
                          title={ax.label}
                        >
                          <a href={url || "#"} target="_blank" rel="noreferrer" className="block" onClick={onClick}>
                            {url ? (
                              <img src={url} alt={ax.label || ax.tipo} className="h-28 w-full object-cover" />
                            ) : (
                              <div className="h-28 grid place-items-center text-xs text-white/60">
                                {ax.no_aplica ? "No aplica" : "Sin imagen"}
                              </div>
                            )}
                          </a>
                          <div className="px-2 py-1 text-xs text-white/75 flex items-center justify-between">
                            <span className="truncate">{ax.label || ax.tipo}</span>
                            <span className="ml-2 rounded-full bg-white/10 px-2 py-[2px] text-[10px]">
                              {ax.no_aplica ? "N/A" : url ? "OK" : "Pend."}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-sm text-slate-400 col-span-full">Sin anexos.</div>
                  )}
                </div>
              )}

              {(it.irregularidad || it.comentario) && (
                <div className="mt-2 text-xs text-amber-200/90 bg-amber-500/10 border border-amber-400/20 rounded-lg px-2 py-1">
                  Nota módulo: {it.irregularidad || it.comentario}
                </div>
              )}

              {!isClosed && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() =>
                      validarMasivo(
                        Object.keys(checked)
                          .filter((k) => checked[k])
                          .map((k) => Number(k))
                      )
                    }
                    className={`px-3 py-1.5 rounded-full text-sm text-white transition ${
                      any ? "bg-emerald-600/90 hover:bg-emerald-600" : "bg-emerald-500/40 cursor-not-allowed"
                    }`}
                    disabled={!any}
                  >
                    Validar seleccionados {any ? `(${Object.values(checked).filter(Boolean).length})` : ""}
                  </button>
                </div>
              )}
            </Box>
          );
        })}

        {!items.length && <div className="text-sm text-white/60">Sin módulos en esta sección.</div>}
      </div>
    );
  };

  const TabCentrales = () => {
    const centralItem = useMemo(() => {
      const arr = sel?.items || [];
      return (
        arr.find((it) => ["CENTRALES", "LISTAS_RESTRICTIVAS"].includes((it.tipo || "").toUpperCase())) ||
        null
      );
    }, [sel?.items]);

    const centralVis = useMemo(() => (centralItem ? estadoVisible(centralItem) : null), [centralItem]);

    return (
      <Box
        title={
          <span className="flex items-center gap-2">
            🏦 Centrales {centralVis && <Badge color={centralVis.color}>{centralVis.label}</Badge>}
          </span>
        }
        right={
          !isClosed && (
            <div className="flex items-center gap-2">
              <input
                ref={centralesInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const input = centralesInputRef.current;
                  const files = e?.target?.files || input?.files || [];
                  if (!files.length) {
                    input?.click?.();
                    return;
                  }
                  const fd = new FormData();
                  for (const f of files) fd.append("files", f);
                  setCentralesBusy(true);
                  try {
                    const { data } = await api.post(
                      `/api/estudios/${sel.id}/centrales_upload/`,
                      fd,
                      { headers: { "Content-Type": "multipart/form-data" } }
                    );
                    setCentrales((prev) => [...(data?.archivos || []), ...prev]);
                    if (input) input.value = "";
                  } finally {
                    setCentralesBusy(false);
                  }
                }}
              />
              <button
                disabled={centralesBusy}
                onClick={() => centralesInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-600 text-white text-sm disabled:opacity-60"
              >
                {centralesBusy ? "Subiendo…" : "Subir"}
              </button>
            </div>
          )
        }
      >
        <ListDocs docs={centrales} />
        {!centrales.length && <div className="text-sm text-white/60">Sin archivos de centrales.</div>}
      </Box>
    );
  };

  // Tab de Listas Restrictivas
  const TabListasRestrictivas = () => (
    <Box title="🚨 Listas restrictivas (antecedentes)">
      <div className="mb-3">
        <label className="block text-sm text-white/80 mb-1">Subir archivo de antecedentes:</label>
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={subirRestrictiva}
          disabled={subiendoRestrictiva || isClosed}
          className="block text-sm"
        />
        {subiendoRestrictiva && <div className="text-xs text-blue-400 mt-1">Subiendo…</div>}
      </div>

      <div>
        <div className="font-semibold text-white/80 mb-2">Archivos subidos:</div>
        {archivosRestrictivas.length === 0 ? (
          <div className="text-sm text-white/60">No hay archivos de antecedentes subidos.</div>
        ) : (
          <ul className="space-y-2">
            {archivosRestrictivas.map((a) => (
              <li key={a.id} className="flex items-center gap-3">
                <button
                  onClick={() => openProtected(a.archivo_url || a.archivo, a.nombre)}
                  className="underline text-blue-300 hover:text-blue-400 text-sm"
                  title="Descargar/Ver archivo"
                >
                  {a.nombre}
                </button>
                <span className="text-xs text-white/50">{fmtDate(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Box>
  );

  /* ====== NUEVO: TAB PATRIMONIO ====== */
  const TabPatrimonio = () => {
    // Toma módulos económicos y arma un resumen
    const econItems = (sel?.items || []).filter((it) =>
      ["INFO_ECONOMICA", "ECONOMICA"].includes((it?.tipo || "").toUpperCase())
    );
    const bloques = econItems.flatMap((it) =>
      Array.isArray(it.economica) ? it.economica : [it.economica].filter(Boolean)
    );
    if (!bloques.length) {
      return <div className="text-sm text-white/60">Sin información de patrimonio.</div>;
    }

    // usa el primero como resumen
    const e = bloques[0] || {};

    return (
      <Box title="📊 Patrimonio e ingresos">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <div><span className="text-white/70">Patrimonio total: </span><b>${money(e.patrimonio_total ?? e.patrimonio)}</b></div>
          <div><span className="text-white/70">Activos: </span><b>${money(e.activos)}</b></div>
          <div><span className="text-white/70">Pasivos: </span><b>${money(e.pasivos)}</b></div>

          <div><span className="text-white/70">Ingresos mensuales: </span><b>${money(e.ingresos ?? e.ingresos_mensuales)}</b></div>
          <div><span className="text-white/70">Egresos mensuales: </span><b>${money(e.egresos ?? e.egresos_mensuales)}</b></div>
          <div><span className="text-white/70">Endeudamiento: </span><b>{valueOrDash(e.nivel_endeudamiento ?? e.endeudamiento)}</b></div>

          <div><span className="text-white/70">Score / puntaje: </span><b>{valueOrDash(e.score ?? e.puntaje)}</b></div>
          <div><span className="text-white/70">Negativos reportados: </span><b>{yesNo(e.registra_negativos)}</b></div>
          <div><span className="text-white/70">Deuda actual: </span><b>{e.deuda_actual != null ? `$${money(e.deuda_actual)}` : "—"}</b></div>
        </div>

        {(e.entidad || e.central || e.fuente) && (
          <div className="mt-2 text-xs text-white/70">
            Fuente: {[e.entidad, e.central, e.fuente].filter(Boolean).join(" · ")}
          </div>
        )}

        {e.observaciones && (
          <div className="mt-2 text-[12px] text-white/85 bg-white/5 border border-white/10 rounded-lg px-2 py-1">
            Obs.: {e.observaciones}
          </div>
        )}
      </Box>
    );
  };

  /* ====== TAB: INFORMACIÓN FAMILIAR ====== */
  const TabInfoFamiliar = () => {
    const info = sel?.candidato?.informacion_familiar;
    if (!info) return <div className="text-sm text-white/60 p-2">Sin información familiar registrada.</div>;
    const parientes = info.parientes || [];
    const hijos = info.hijos || [];
    const convivientes = info.convivientes || [];
    return (
      <div className="space-y-4">
        <Box title="👨‍👩‍👧 Información familiar">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm mb-3">
            <div><span className="text-white/70">Estado civil: </span><b>{valueOrDash(info.estado_civil)}</b></div>
            {info.nombre_pareja && <div><span className="text-white/70">Pareja: </span><b>{info.nombre_pareja}</b></div>}
            {info.ocupacion_pareja && <div><span className="text-white/70">Ocupación pareja: </span><b>{info.ocupacion_pareja}</b></div>}
            {info.empresa_pareja && <div><span className="text-white/70">Empresa pareja: </span><b>{info.empresa_pareja}</b></div>}
          </div>
          {info.observaciones && (
            <div className="text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2">
              <span className="text-white/60">Observaciones: </span>{info.observaciones}
            </div>
          )}
        </Box>

        {parientes.length > 0 && (
          <Box title="👥 Parientes">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/50 text-xs uppercase">
                    <th className="text-left pb-2 pr-4">Parentesco</th>
                    <th className="text-left pb-2 pr-4">Nombre</th>
                    <th className="text-left pb-2 pr-4">Ocupación</th>
                    <th className="text-left pb-2 pr-4">Teléfono</th>
                    <th className="text-left pb-2 pr-4">Ciudad</th>
                    <th className="text-left pb-2">Vive con él/ella</th>
                  </tr>
                </thead>
                <tbody>
                  {parientes.map((p, i) => (
                    <tr key={i} className="border-t border-white/10">
                      <td className="py-1.5 pr-4 font-medium">{valueOrDash(p.parentesco)}</td>
                      <td className="py-1.5 pr-4">{valueOrDash(p.nombre_apellido)}</td>
                      <td className="py-1.5 pr-4">{valueOrDash(p.ocupacion)}</td>
                      <td className="py-1.5 pr-4">{valueOrDash(p.telefono)}</td>
                      <td className="py-1.5 pr-4">{valueOrDash(p.ciudad)}</td>
                      <td className="py-1.5">{yesNo(p.vive_con_el)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Box>
        )}

        {hijos.length > 0 && (
          <Box title="👶 Hijos">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/50 text-xs uppercase">
                    <th className="text-left pb-2 pr-4">Nombre</th>
                    <th className="text-left pb-2 pr-4">Ocupación</th>
                    <th className="text-left pb-2">Vive con él/ella</th>
                  </tr>
                </thead>
                <tbody>
                  {hijos.map((h, i) => (
                    <tr key={i} className="border-t border-white/10">
                      <td className="py-1.5 pr-4 font-medium">{valueOrDash(h.nombre_apellido)}</td>
                      <td className="py-1.5 pr-4">{valueOrDash(h.ocupacion)}</td>
                      <td className="py-1.5">{yesNo(h.vive_con_el)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Box>
        )}

        {convivientes.length > 0 && (
          <Box title="🏠 Convivientes">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/50 text-xs uppercase">
                    <th className="text-left pb-2 pr-4">Parentesco</th>
                    <th className="text-left pb-2 pr-4">Nombre</th>
                    <th className="text-left pb-2 pr-4">Ocupación</th>
                    <th className="text-left pb-2">Teléfono</th>
                  </tr>
                </thead>
                <tbody>
                  {convivientes.map((c, i) => (
                    <tr key={i} className="border-t border-white/10">
                      <td className="py-1.5 pr-4 font-medium">{valueOrDash(c.parentesco)}</td>
                      <td className="py-1.5 pr-4">{valueOrDash(c.nombre_apellido)}</td>
                      <td className="py-1.5 pr-4">{valueOrDash(c.ocupacion)}</td>
                      <td className="py-1.5">{valueOrDash(c.telefono)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Box>
        )}

        {parientes.length === 0 && hijos.length === 0 && convivientes.length === 0 && (
          <div className="text-sm text-white/50">No hay parientes, hijos ni convivientes registrados.</div>
        )}
      </div>
    );
  };

  /* ====== TAB: DESCRIPCIÓN DE VIVIENDA ====== */
  const TabDescripcionVivienda = () => {
    const dv = sel?.candidato?.descripcion_vivienda;
    if (!dv) return <div className="text-sm text-white/60 p-2">Sin descripción de vivienda registrada.</div>;
    return (
      <Box title="🏡 Descripción de vivienda">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <div>
            <div className="text-white/50 text-xs uppercase mb-1">Estado vivienda</div>
            <div className="font-medium">{valueOrDash(dv.estado_vivienda)}</div>
          </div>
          <div>
            <div className="text-white/50 text-xs uppercase mb-1">Iluminación</div>
            <div className="font-medium">{valueOrDash(dv.iluminacion)}</div>
          </div>
          <div>
            <div className="text-white/50 text-xs uppercase mb-1">Ventilación</div>
            <div className="font-medium">{valueOrDash(dv.ventilacion)}</div>
          </div>
          <div>
            <div className="text-white/50 text-xs uppercase mb-1">Aseo</div>
            <div className="font-medium">{valueOrDash(dv.aseo)}</div>
          </div>
          <div>
            <div className="text-white/50 text-xs uppercase mb-1">Condiciones</div>
            <div className="font-medium">{valueOrDash(dv.condiciones)}</div>
          </div>
          <div>
            <div className="text-white/50 text-xs uppercase mb-1">Tenencia</div>
            <div className="font-medium">{valueOrDash(dv.tenencia)}</div>
          </div>
          <div>
            <div className="text-white/50 text-xs uppercase mb-1">Tipo de inmueble</div>
            <div className="font-medium">{valueOrDash(dv.tipo_inmueble)}</div>
          </div>
          <div>
            <div className="text-white/50 text-xs uppercase mb-1">Vías de aproximación</div>
            <div className="font-medium">{valueOrDash(dv.vias_aproximacion)}</div>
          </div>
          {dv.servicios_publicos && (
            <div>
              <div className="text-white/50 text-xs uppercase mb-1">Servicios públicos</div>
              <div className="font-medium">{dv.servicios_publicos}</div>
            </div>
          )}
          {dv.espacios && (
            <div>
              <div className="text-white/50 text-xs uppercase mb-1">Espacios</div>
              <div className="font-medium">{dv.espacios}</div>
            </div>
          )}
        </div>
      </Box>
    );
  };

  const TabReferencias = () => {
    const max = 3;

    const addLab = () =>
      setRefs((r) =>
        r.laborales.length >= max ? r : { ...r, laborales: [...r.laborales, { funcionario: "", cargo: "" }] }
      );

    const addPer = () =>
      setRefs((r) =>
        r.personales.length >= max ? r : { ...r, personales: [...r.personales, { nombre: "", familiar: "" }] }
      );

    const updLab = (i, k, v) =>
      setRefs((r) => ({ ...r, laborales: r.laborales.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)) }));

    const updPer = (i, k, v) =>
      setRefs((r) => ({ ...r, personales: r.personales.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)) }));

    const delLab = (i) =>
      setRefs((r) => ({ ...r, laborales: r.laborales.filter((_, idx) => idx !== i) }));

    const delPer = (i) =>
      setRefs((r) => ({ ...r, personales: r.personales.filter((_, idx) => idx !== i) }));

    return (
      <Box
        title="📝 Referencias"
        right={
          !isClosed && (
            <button
              onClick={saveReferencias}
              disabled={savingRefs}
              className="px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-white text-sm disabled:opacity-60"
            >
              {savingRefs ? "Guardando…" : "Guardar"}
            </button>
          )
        }
      >
        <div className="grid md:grid-cols-2 gap-4">
          {/* Laborales */}
          <div>
            <div className="mb-2 font-semibold text-white/90">
              Referencias laborales <span className="text-xs text-white/50">(máx. 3)</span>
            </div>
            {refs.laborales.map((r, i) => (
              <div key={`lab-${i}`} className="mb-2 rounded-xl border border-white/10 bg-white/5 p-2">
                <div className="grid sm:grid-cols-2 gap-2">
                  <input
                    className={inputClass}
                    placeholder="Funcionario que referencia"
                    value={r.funcionario || ""}
                    onChange={(e) => updLab(i, "funcionario", e.target.value)}
                    disabled={isClosed}
                  />
                  <input
                    className={inputClass}
                    placeholder="Cargo de quien referencia"
                    value={r.cargo || ""}
                    onChange={(e) => updLab(i, "cargo", e.target.value)}
                    disabled={isClosed}
                  />
                </div>
                {!isClosed && (
                  <div className="mt-2 text-right">
                    <button
                      onClick={() => delLab(i)}
                      className="px-2 py-1 rounded-lg border border-white/10 text-xs hover:bg-white/10"
                    >
                      Quitar
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!isClosed && (
              <button
                onClick={addLab}
                disabled={refs.laborales.length >= max}
                className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-sm disabled:opacity-50"
              >
                + Agregar laboral
              </button>
            )}
          </div>

          {/* Personales */}
          <div>
            <div className="mb-2 font-semibold text-white/90">
              Referencias personales <span className="text-xs text-white/50">(máx. 3)</span>
            </div>
            {refs.personales.map((r, i) => (
              <div key={`per-${i}`} className="mb-2 rounded-xl border border-white/10 bg-white/5 p-2">
                <div className="grid sm:grid-cols-2 gap-2">
                  <input
                    className={inputClass}
                    placeholder="Nombre"
                    value={r.nombre || ""}
                    onChange={(e) => updPer(i, "nombre", e.target.value)}
                    disabled={isClosed}
                  />
                  <input
                    className={inputClass}
                    placeholder="Familiar (parentesco)"
                    value={r.familiar || ""}
                    onChange={(e) => updPer(i, "familiar", e.target.value)}
                    disabled={isClosed}
                  />
                </div>
                {!isClosed && (
                  <div className="mt-2 text-right">
                    <button
                      onClick={() => delPer(i)}
                      className="px-2 py-1 rounded-lg border border-white/10 text-xs hover:bg-white/10"
                    >
                      Quitar
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!isClosed && (
              <button
                onClick={addPer}
                disabled={refs.personales.length >= max}
                className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-sm disabled:opacity-50"
              >
                + Agregar personal
              </button>
            )}
          </div>
        </div>
      </Box>
    );
  };

  /* --------------------- render --------------------- */
  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(1200px_700px_at_20%_20%,rgba(255,255,255,0.08),transparent_60%),radial-gradient(900px_500px_at_80%_80%,rgba(59,130,246,0.10),transparent_60%),linear-gradient(180deg,#0b1220_0%,#0a0f1a_100%)]" />
      <ThreeBackground />

      <div className="max-w-7xl mx-auto p-6 space-y-6 text-white">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Panel del analista</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setWide((w) => !w)}
              className="rounded-xl border border-white/10 hover:bg-white/10 px-3 py-2 text-sm"
            >
              {wide ? "Vista doble" : "Ampliar detalle"}
            </button>
            <NotificacionesBell />
          </div>
        </div>

        {/* Filtros */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-md">
          <div className="grid md:grid-cols-6 gap-3">
            <input
              className={inputClass}
              placeholder="Desde (YYYY-MM-DD)"
              value={f.desde}
              onChange={(e) => setF((s) => ({ ...s, desde: e.target.value }))}
            />
            <input
              className={inputClass}
              placeholder="Hasta (YYYY-MM-DD)"
              value={f.hasta}
              onChange={(e) => setF((s) => ({ ...s, hasta: e.target.value }))}
            />
            <select
              className={inputClass}
              value={f.estado}
              onChange={(e) => setF((s) => ({ ...s, estado: e.target.value }))}
            >
              <option value="">Estado de ítem (todos)</option>
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="EN_VALIDACION">EN_VALIDACION</option>
              <option value="VALIDADO">VALIDADO</option>
              <option value="HALLAZGO">HALLAZGO</option>
              <option value="CERRADO">CERRADO</option>
            </select>
            <input
              className={inputClass}
              placeholder="Cédula"
              value={f.cedula}
              onChange={(e) => setF((s) => ({ ...s, cedula: e.target.value }))}
            />
            <select
              className={inputClass}
              value={f.empresa}
              onChange={(e) => setF((s) => ({ ...s, empresa: e.target.value }))}
            >
              <option value="">Empresa (todas)</option>
              {empresas.map((em, idx) => (
                <option key={em + idx} value={em}>{em}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button className={`flex-1 ${buttonPrimary}`} onClick={load}>
                Aplicar
              </button>
              <button
                className={`flex-1 ${buttonGhost}`}
                onClick={() => setF({ estado: "", desde: "", hasta: "", cedula: "" })}
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>

        {/* Layout: doble o ancho completo */}
        {!wide ? (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Lista */}
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Estudios</h2>
              <div className="rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md overflow-hidden">
                {loading && <div className="p-4 text-sm text-white/70">Cargando…</div>}
                {!loading &&
                  estudiosPaginados.map((es) => {
                    const progress = getPinned(es.id, es.progreso || 0);
                    // Extraer nombre y apellido del candidato
                    const candidato = es.candidato || es.solicitud?.candidato || {};
                    const nombre = candidato.nombre || "";
                    const apellido = candidato.apellido || "";
                    // Extraer empresa
                    let empresa = es.empresa || es.empresa_nombre || candidato.empresa || es.solicitud?.empresa_nombre || es.solicitud?.empresa || "";
                    if (empresa && typeof empresa === 'object') {
                      empresa = empresa.nombre || empresa.id || JSON.stringify(empresa);
                    }
                    empresa = String(empresa);
                    return (
                      <button
                        key={es.id}
                        onClick={() => openEstudio(es.id)}
                        className={`w-full text-left p-4 border-b border-white/10 last:border-b-0 transition ${
                          sel?.id === es.id ? "bg-white/5" : "hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">#{es.id} - {nombre} {apellido}</span>
                            {!!es.nivel_cualitativo && (
                              <Badge color={riesgoColor(es.nivel_cualitativo)}>
                                {es.nivel_cualitativo}
                              </Badge>
                            )}
                            {typeof es.score_cuantitativo === "number" && (
                              <span className="ml-2 text-xs font-semibold text-blue-300 bg-blue-500/10 rounded-full px-2 py-0.5">
                                {Math.round(es.score_cuantitativo)}%
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-white/60">{Math.round(progress)}%</span>
                        </div>
                        <div className="mt-2">
                          <MiniBar value={progress} />
                        </div>
                        {empresa && (
                          <div className="mt-1 text-xs text-white/60 font-medium">{empresa}</div>
                        )}
                      </button>
                    );
                  })}

                {/* Controles de paginación */}
                {!loading && totalEstudiosPages > 1 && (
                  <div className="flex justify-center items-center gap-4 py-3 bg-transparent">
                    <button
                      onClick={() => setEstudiosPage((p) => Math.max(1, p - 1))}
                      disabled={estudiosPage === 1}
                      className={`px-3 py-1 rounded-lg font-semibold ${estudiosPage === 1 ? "bg-gray-700 text-gray-400 cursor-not-allowed" : "bg-blue-700 text-white hover:bg-blue-800"}`}
                    >
                      Anterior
                    </button>
                    <span className="text-sm text-white/80">Página {estudiosPage} de {totalEstudiosPages}</span>
                    <button
                      onClick={() => setEstudiosPage((p) => Math.min(totalEstudiosPages, p + 1))}
                      disabled={estudiosPage === totalEstudiosPages}
                      className={`px-3 py-1 rounded-lg font-semibold ${estudiosPage === totalEstudiosPages ? "bg-gray-700 text-gray-400 cursor-not-allowed" : "bg-blue-700 text-white hover:bg-blue-800"}`}
                    >
                      Siguiente
                    </button>
                  </div>
                )}

                {!loading && !estudios.length && (
                  <div className="p-4 text-sm text-white/70">Sin resultados.</div>
                )}
              </div>
            </div>

            {/* Detalle */}
            <Detalle
              sel={sel}
              isClosed={isClosed}
              selectedProgress={selectedProgress}
              invitarCandidato={invitarCandidato}
              invitando={invitando}
              devolver={devolver}
              devolviendo={devolviendo}
              openObs={openObs}
              openDecidir={openDecidir}
              tab={tab}
              setTab={setTab}
              TabCandidato={TabCandidato}
              TabPorTipo={TabPorTipo}
              TabCentrales={TabCentrales}
              TabPatrimonio={TabPatrimonio}
              TabReferencias={TabReferencias}
              TabInfoFamiliar={TabInfoFamiliar}
              TabDescripcionVivienda={TabDescripcionVivienda}
              TabListasRestrictivas={TabListasRestrictivas}
            />
          </div>
        ) : (
          <Detalle
            sel={sel}
            isClosed={isClosed}
            selectedProgress={selectedProgress}
            invitarCandidato={invitarCandidato}
            devolver={devolver}
            openObs={openObs}
            openDecidir={openDecidir}
            tab={tab}
            setTab={setTab}
            TabCandidato={TabCandidato}
            TabPorTipo={TabPorTipo}
            TabCentrales={TabCentrales}
            TabPatrimonio={TabPatrimonio}
            TabReferencias={TabReferencias}
            TabInfoFamiliar={TabInfoFamiliar}
            TabDescripcionVivienda={TabDescripcionVivienda}
            TabListasRestrictivas={TabListasRestrictivas}
          />
        )}
      </div>

      {/* Modal: Devolver estudio */}
      {devolverModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true"
          onKeyDown={(e) => e.key === "Escape" && !devolverModal.busy && setDevolverModal((s) => ({ ...s, open: false }))}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !devolverModal.busy && setDevolverModal((s) => ({ ...s, open: false }))} />
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0d1423] p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">Devolver estudio al candidato</h3>
              <button onClick={() => !devolverModal.busy && setDevolverModal((s) => ({ ...s, open: false }))}
                className="rounded-md px-2 py-1 text-white/60 hover:bg-white/10 text-lg leading-none" disabled={devolverModal.busy}>×</button>
            </div>
            <p className="text-sm text-white/60 mb-3">
              Escribe la observación que verá el candidato al ingresar. Es obligatoria.
            </p>
            <textarea
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-white/5 text-white placeholder-white/30 p-3 text-sm outline-none focus:border-white/30 resize-none"
              placeholder="Ej: Por favor completa la información económica y adjunta el certificado laboral…"
              value={devolverModal.obs}
              onChange={(e) => setDevolverModal((s) => ({ ...s, obs: e.target.value }))}
              disabled={devolverModal.busy}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setDevolverModal((s) => ({ ...s, open: false }))}
                className="px-4 py-2 rounded-xl border border-white/10 text-sm text-white/70 hover:bg-white/5"
                disabled={devolverModal.busy}>Cancelar</button>
              <button onClick={confirmarDevolver}
                disabled={devolverModal.busy || !devolverModal.obs.trim()}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                {devolverModal.busy && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                )}
                {devolverModal.busy ? "Enviando…" : "Confirmar devolución"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal global (Concepto Final / decidir) */}
      {modal.open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          onKeyDown={(e) => e.key === "Escape" && !modal.busy && setModal((m) => ({ ...m, open: false }))}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !modal.busy && setModal((m) => ({ ...m, open: false }))}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d1423] p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                {modal.mode === "DECIDIR" ? `Cerrar estudio: ${modal.decision}` : "Concepto Final"}
              </h3>
              <button
                type="button"
                onClick={() => !modal.busy && setModal((m) => ({ ...m, open: false }))}
                className="rounded-md px-2 py-1 text-sm text-white/70 hover:bg-white/10"
                disabled={modal.busy}
                aria-label="Cerrar"
                title="Cerrar"
              >
                ✕
              </button>
            </div>
            <label className="block text-sm text-white/80">
              <span className="mb-1 block text-white/70">
                {modal.mode === "DECIDIR" ? "Observación (opcional)" : "Escribe tu concepto final"}
              </span>
              <textarea
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/10 p-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/30"
                rows={6}
                value={modal.text}
                onChange={(e) => setModal((m) => ({ ...m, text: e.target.value }))}
                placeholder={modal.mode === "DECIDIR" ? "Ej.: Comentario de cierre (opcional)" : "Ej.: Concepto final o justificación"}
              />
            </label>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal((m) => ({ ...m, open: false }))}
                className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/20 disabled:opacity-60"
                disabled={modal.busy}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitModal}
                className={`rounded-xl px-3 py-1.5 text-sm font-medium text-white ${
                  modal.busy ? "bg-slate-600 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-500"
                }`}
                disabled={modal.busy}
              >
                {modal.busy ? "Guardando…" : modal.mode === "DECIDIR" ? "Confirmar cierre" : "Guardar concepto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------ Detalle: reutilizable ------------ */
export function Detalle({
  sel,
  isClosed,
  selectedProgress,
  invitarCandidato,
  invitando,
  devolver,
  devolviendo,
  openObs,
  openDecidir,
  tab,
  setTab,
  TabCandidato,
  TabPorTipo,
  TabCentrales,
  TabPatrimonio,
  TabReferencias,
  TabInfoFamiliar,
  TabDescripcionVivienda,
  TabListasRestrictivas,
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Detalle</h2>
      {!sel ? (
        <div className="p-4 rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md">
          Selecciona un estudio
        </div>
      ) : (
        <div className="p-4 rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md space-y-4">
          {/* Banner: Estudio a consideración del cliente (ahora dentro del panel, no fixed) */}
          {sel.a_consideracion_cliente && (
            <div
              className="mb-3 flex items-center gap-4 p-4 border border-yellow-400/40 bg-yellow-100/90 shadow-xl rounded-xl"
            >
              <span className="text-amber-700 font-semibold text-base flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Este estudio fue creado bajo consideración del cliente. Los criterios seleccionados como no relevantes fueron configurados por el cliente y el resultado debe ser interpretado bajo esa política.
              </span>
            </div>
          )}

          {/* PROGRESO ARRIBA */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="font-semibold">Estudio #{sel.id}</div>
              {sel.estado && <Badge color={estadoColor(sel.estado)}>{sel.estado}</Badge>}
              {sel.decision_final && (
                <Badge color={sel.decision_final === "APTO" ? "green" : "red"}>
                  {sel.decision_final}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-white/70">
                Progreso: {Math.round(selectedProgress)}%
              </div>
              <div className="w-40">
                <MiniBar value={selectedProgress} />
              </div>
              <button
                onClick={invitarCandidato}
                className="px-3 py-1.5 rounded-full bg-indigo-600/90 hover:bg-indigo-600 text-white text-sm disabled:opacity-60 flex items-center gap-1.5"
                disabled={isClosed || invitando}
              >
                {invitando && (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                )}
                {invitando ? "Enviando…" : "Invitar candidato"}
              </button>
            </div>
          </div>

          {sel.observacion_analista && (
            <div className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-400/20 rounded-lg px-2 py-1">
              Observación enviada: {sel.observacion_analista}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!isClosed ? (
              <>
                <button
                  onClick={openObs}
                  className="px-3 py-1.5 rounded-full border border-white/15 hover:bg-white/10 text-white text-sm"
                >
                  Concepto Final
                </button>
                <button
                  onClick={devolver}
                  disabled={devolviendo}
                  className="px-3 py-1.5 rounded-full bg-amber-600/90 hover:bg-amber-600 text-white text-sm disabled:opacity-60 flex items-center gap-1.5"
                >
                  {devolviendo && (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                    </svg>
                  )}
                  {devolviendo ? "Devolviendo…" : "Devolver"}
                </button>
                <button
                  onClick={() => openDecidir("APTO")}
                  className="px-3 py-1.5 rounded-full bg-emerald-600/90 hover:bg-emerald-600 text-white text-sm"
                >
                  Cerrar: APTO
                </button>
                <button
                  onClick={() => openDecidir("NO_APTO")}
                  className="px-3 py-1.5 rounded-full bg-rose-600/90 hover:bg-rose-600 text-white text-sm"
                >
                  Cerrar: NO APTO
                </button>
                {/* Botón especial para aprobación bajo consideración del cliente */}
                {sel.a_consideracion_cliente && (
                  <button
                    onClick={() => openDecidir("APTO_CONSIDERACION")}
                    className="px-3 py-1.5 rounded-full bg-yellow-500/90 hover:bg-yellow-500 text-white text-sm border border-yellow-700"
                  >
                    Aprobar bajo consideración del cliente
                  </button>
                )}
              </>
            ) : (
              <span className="text-sm text-white/70">
                Estudio cerrado el{" "}
                {sel.finalizado_at ? new Date(sel.finalizado_at).toLocaleString() : "—"}
              </span>
            )}
          </div>

          {/* Tabs */}
          <div className="mt-1">
            <div className="flex flex-wrap gap-2">
              {[
                ["CANDIDATO", "Candidato"],
                ["DOCS", "Docs"],
                ["ACADEMICO", "Académico"],
                ["LABORAL", "Laboral"],
                ["ECONOMICA", "Económica"],
                ["PATRIMONIO", "Patrimonio"],
                ["ANEXOS", "Anexos"],
                ["CENTRALES", "Centrales"],
                ["LISTAS_RESTRICTIVAS", "Listas Restrictivas"],
                ["REFERENCIAS", "Referencias"],
                ["INFO_FAMILIAR", "Info Familiar"],
                ["DESCRIPCION_VIVIENDA", "Descripción Vivienda"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-3 py-1.5 rounded-full text-sm ring-1 transition ${
                    tab === key ? "bg-white/20 ring-white/20" : "bg-white/10 hover:bg-white/15 ring-white/10"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3 space-y-3">
              {tab === "CANDIDATO" && <TabCandidato />}
              {tab === "DOCS" && <TabPorTipo tipos={["DOC", "DOCS", "DOCUMENTOS"]} />}
              {tab === "ACADEMICO" && <TabPorTipo tipos={["ACADEMICO", "TITULOS_ACADEMICOS"]} />}
              {tab === "LABORAL" && <TabPorTipo tipos={["LABORAL", "CERT_LABORALES"]} />}
              {tab === "ECONOMICA" && <TabPorTipo tipos={["INFO_ECONOMICA", "ECONOMICA"]} />}
              {tab === "PATRIMONIO" && <TabPatrimonio />}
              {tab === "ANEXOS" && <TabPorTipo tipos={["VISITA_DOMICILIARIA"]} />}
              {tab === "CENTRALES" && <TabCentrales />}
              {tab === "LISTAS_RESTRICTIVAS" && <TabListasRestrictivas />}
              {tab === "REFERENCIAS" && <TabReferencias />}
              {tab === "INFO_FAMILIAR" && <TabInfoFamiliar />}
              {tab === "DESCRIPCION_VIVIENDA" && <TabDescripcionVivienda />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- mini componente para observaciones por registro ---- */
function ObsRegistro({ open, setOpen, sugerencias, text, setText, onSave, saving }) {
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="px-2 py-1 rounded-lg border border-white/15 hover:bg-white/10 text-white text-xs"
      >
        {open ? "Ocultar obs. registro" : "Obs. registro"}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-2">
          <div className="mb-2 flex flex-wrap gap-2">
            {sugerencias.map((s) => (
              <button
                key={s}
                onClick={() => setText((text || "") + (text ? "; " : "") + s)}
                className="rounded-full px-2 py-0.5 text-xs bg-white/10 hover:bg-white/15 ring-1 ring-white/10"
              >
                {s}
              </button>
            ))}
          </div>
          <textarea
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-white/10 p-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/30"
            placeholder="Ej.: Observación sobre este registro"
            value={text || ""}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="px-2 py-1 rounded-lg border border-white/10 text-xs hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              onClick={onSave}
              className={`px-2 py-1 rounded-lg text-white text-xs ${
                saving ? "bg-slate-600 cursor-not-allowed" : "bg-emerald-600/90 hover:bg-emerald-600"
              }`}
              disabled={saving}
            >
              {saving ? "Guardando…" : "Guardar observación"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}