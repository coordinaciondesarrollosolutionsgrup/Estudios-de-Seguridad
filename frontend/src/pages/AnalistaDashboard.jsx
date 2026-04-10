import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import NotificacionesBell from "../components/NotificacionesBell";
import ThreeBackground from "../components/ThreeBackground";
import { useToast } from "../components/Toast";
import AppNavbar from "../components/AppNavbar";

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
  const [vistaEstudios, setVistaEstudios] = useState("ASIGNADOS");
  // Paginación de estudios
  const [estudiosPage, setEstudiosPage] = useState(1);
  const estudiosFiltrados = useMemo(() => {
    if (vistaEstudios === "NO_ASIGNADOS") {
      return estudios.filter((e) => e.es_propietario === false);
    }
    return estudios.filter((e) => e.es_propietario !== false);
  }, [estudios, vistaEstudios]);
  const totalEstudiosPages = Math.max(1, Math.ceil(estudiosFiltrados.length / PAGE_SIZE));
  const estudiosPaginados = estudiosFiltrados.slice((estudiosPage - 1) * PAGE_SIZE, estudiosPage * PAGE_SIZE);

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
  const [visitaVirtual, setVisitaVirtual] = useState(null);
  const [visitaBusy, setVisitaBusy] = useState(false);
  const [meetingUrlDraft, setMeetingUrlDraft] = useState("");
  const [evaluacion, setEvaluacion] = useState(null);
  const [disponibilidadReunion, setDisponibilidadReunion] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotForm, setSlotForm] = useState({ fecha: "", hora_inicio: "", hora_fin: "" });
  const [slotBusy, setSlotBusy] = useState(false);
  const [showDisponibilidad, setShowDisponibilidad] = useState(false);
  const [showReunionVirtual, setShowReunionVirtual] = useState(false);
  const [agendaEstudio, setAgendaEstudio] = useState({
    reunion: null,
    fechaLimite: null,
    vencido: false,
    totalSlotsDisponibles: 0,
    mensaje: "",
  });
  const [agendaEstudioBusy, setAgendaEstudioBusy] = useState(false);

  // Agenda global del analista (nuevo sistema tipo cita médica)
  const [agendaGlobal, setAgendaGlobal] = useState([]);
  const [agendaForm, setAgendaForm] = useState({ fecha: "", hora_inicio: "" });
  const [agendaBusy, setAgendaBusy] = useState(false);
  const [showAgenda, setShowAgenda] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [calendarSelectedDay, setCalendarSelectedDay] = useState(null);

  // "Ampliar detalle"
  const [wide, setWide] = useState(false);

  // Centrales
  const [centrales, setCentrales] = useState([]);
  const centralesInputRef = useRef(null);
  const [centralesBusy, setCentralesBusy] = useState(false);

  // âž• Referencias
  const [refs, setRefs] = useState({ laborales: [], personales: [] });
  const [savingRefs, setSavingRefs] = useState(false);

  // Tabs
  const [tab, setTab] = useState("CANDIDATO");

  // Resumen del estudio (fill_candidato por módulo)
  const [resumen, setResumen] = useState(null);

  const loadResumen = async (id) => {
    try {
      const { data } = await api.get(`/api/estudios/${id}/resumen/`);
      setResumen(data);
    } catch {
      setResumen(null);
    }
  };

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

  const loadVisitaVirtual = async (id) => {
    try {
      const { data } = await api.get(`/api/estudios/${id}/visita-virtual/`);
      setVisitaVirtual(data || null);
      // No sobreescribir el draft que el analista está editando;
      // solo inicializar si el campo está vacío
      if (data?.meeting_url) {
        setMeetingUrlDraft(prev => prev ? prev : data.meeting_url);
      }
    } catch {
      setVisitaVirtual(null);
    }
  };

  const loadSlots = async (id) => {
    try {
      const { data } = await api.get(`/api/estudios/${id}/slots-analista/`);
      setSlots(Array.isArray(data) ? data : []);
    } catch {
      setSlots([]);
    }
  };

  const agregarSlot = async () => {
    if (!sel?.id || !slotForm.fecha || !slotForm.hora_inicio) {
      toast.error("Fecha y hora inicio son obligatorios.");
      return;
    }
    setSlotBusy(true);
    try {
      const toApiTime = (value) => {
        if (!value) return undefined;
        return value.length === 5 ? `${value}:00` : value;
      };
      const payload = {
        fecha: slotForm.fecha,
        hora_inicio: toApiTime(slotForm.hora_inicio),
      };
      const horaFin = toApiTime(slotForm.hora_fin);
      if (horaFin) payload.hora_fin = horaFin;

      const { data } = await api.post(`/api/estudios/${sel.id}/slots-analista/`, payload);
      setSlots(Array.isArray(data) ? data : []);
      setSlotForm({ fecha: "", hora_inicio: "", hora_fin: "" });
      toast.success("Slot agregado.");
    } catch (e) {
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.hora_inicio?.[0] ||
        e?.response?.data?.hora_fin?.[0] ||
        e?.response?.data?.fecha?.[0] ||
        "No se pudo agregar el slot.";
      toast.error(detail);
    } finally {
      setSlotBusy(false);
    }
  };

  const eliminarSlot = async (slotId) => {
    if (!sel?.id) return;
    setSlotBusy(true);
    try {
      const { data } = await api.delete(`/api/estudios/${sel.id}/slots-analista/${slotId}/`);
      setSlots(Array.isArray(data) ? data : []);
      toast.success("Slot eliminado.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No se pudo eliminar el slot.");
    } finally {
      setSlotBusy(false);
    }
  };

  // â”€â”€ Agenda global del analista (nuevo sistema tipo cita médica) â”€â”€

  const loadAgendaGlobal = async () => {
    try {
      const { data } = await api.get("/api/disponibilidad-analista/");
      setAgendaGlobal(Array.isArray(data) ? data : (data?.results ?? []));
    } catch {
      setAgendaGlobal([]);
    }
  };

  const loadAgendaEstudio = async (id) => {
    if (!id) {
      setAgendaEstudio({
        reunion: null,
        fechaLimite: null,
        vencido: false,
        totalSlotsDisponibles: 0,
        mensaje: "",
      });
      return;
    }
    try {
      const [{ data: reunionData }, { data: slotsData }] = await Promise.all([
        api.get(`/api/estudios/${id}/reunion-agendada/`),
        api.get(`/api/estudios/${id}/reunion-agendada/slots-disponibles/`),
      ]);
      const slotsDisponibles = Array.isArray(slotsData?.slots) ? slotsData.slots : [];
      // Solo inicializar el draft si el campo está vacío, para no pisar lo que el analista escribió
      if (reunionData?.meeting_url) {
        setMeetingUrlDraft(prev => prev ? prev : reunionData.meeting_url);
      }
      setAgendaEstudio({
        reunion: reunionData?.slot ? reunionData : null,
        fechaLimite: reunionData?.fecha_limite || slotsData?.fecha_limite || null,
        vencido: Boolean(slotsData?.vencido),
        totalSlotsDisponibles: slotsDisponibles.length,
        mensaje: slotsData?.mensaje || "",
      });
    } catch {
      setAgendaEstudio({
        reunion: null,
        fechaLimite: null,
        vencido: false,
        totalSlotsDisponibles: 0,
        mensaje: "",
      });
    }
  };

  const agregarAgendaSlot = async () => {
    if (!agendaForm.fecha || !agendaForm.hora_inicio) {
      toast.error("Fecha y hora de inicio son obligatorios.");
      return;
    }
    setAgendaBusy(true);
    try {
      await api.post("/api/disponibilidad-analista/", {
        fecha: agendaForm.fecha,
        hora_inicio: agendaForm.hora_inicio,
      });
      setAgendaForm({ fecha: "", hora_inicio: "" });
      await loadAgendaGlobal();
      toast.success("Horario agregado a tu agenda.");
    } catch (e) {
      toast.error(
        e?.response?.data?.detail ||
        e?.response?.data?.non_field_errors?.[0] ||
        "No se pudo agregar el horario."
      );
    } finally {
      setAgendaBusy(false);
    }
  };

  const eliminarAgendaSlot = async (slotId) => {
    setAgendaBusy(true);
    try {
      await api.delete(`/api/disponibilidad-analista/${slotId}/`);
      await loadAgendaGlobal();
      toast.success("Horario eliminado.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No se pudo eliminar el horario.");
    } finally {
      setAgendaBusy(false);
    }
  };

  const cancelarReunionAgendada = async () => {
    if (!sel?.id) return;
    setAgendaEstudioBusy(true);
    try {
      await api.post(`/api/estudios/${sel.id}/reunion-agendada/cancelar/`);
      await Promise.all([loadAgendaEstudio(sel.id), loadAgendaGlobal()]);
      toast.success("Horario liberado para que otro candidato pueda reservarlo.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No se pudo liberar el horario.");
    } finally {
      setAgendaEstudioBusy(false);
    }
  };

  const programarReunionVirtual = async () => {
    if (!sel?.id) return;
    const url = (meetingUrlDraft || "").trim();
    if (!url) {
      toast.error("Pega el link de la reunion creado en Google Calendar.");
      return;
    }
    setAgendaEstudioBusy(true);
    try {
      await api.post(`/api/estudios/${sel.id}/visita-virtual/programar/`, {
        meeting_url: url,
      });
      await Promise.all([loadAgendaEstudio(sel.id), loadVisitaVirtual(sel.id)]);
      toast.success("Reunion programada. El candidato ya puede ver el enlace.");
    } catch (e) {
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.meeting_url?.[0] ||
        "No se pudo guardar la programacion de la reunion.";
      toast.error(detail);
    } finally {
      setAgendaEstudioBusy(false);
    }
  };

  // â”€â”€ Helpers para el calendario de agenda â”€â”€
  const HORAS_AGENDA = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];

  const toFechaStr = (d) =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const getCalendarDays = (monthDate) => {
    const y = monthDate.getFullYear(), m = monthDate.getMonth();
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7; // 0=Lun
    const start = new Date(firstDay);
    start.setDate(start.getDate() - startOffset);
    const days = [];
    const cur = new Date(start);
    while (cur <= lastDay || days.length % 7 !== 0) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
      if (days.length >= 42) break;
    }
    return days;
  };

  const getSlotForCell = (dayDate, hora) => {
    const fechaStr = toFechaStr(dayDate);
    return agendaGlobal.find(s => s.fecha === fechaStr && s.hora_inicio.slice(0, 5) === hora);
  };

  const agregarSlotCalendario = async (dayDate, hora) => {
    setAgendaBusy(true);
    try {
      await api.post("/api/disponibilidad-analista/", { fecha: toFechaStr(dayDate), hora_inicio: hora + ':00' });
      await loadAgendaGlobal();
      toast.success("Horario agregado.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No se pudo agregar el horario.");
    } finally {
      setAgendaBusy(false);
    }
  };

  const iniciarVisitaVirtual = async () => {
    if (!sel?.id) return;
    const url = (meetingUrlDraft || agendaEstudio?.reunion?.meeting_url || "").trim();
    if (!url) {
      toast.error("Ingresa el link de la reunión virtual.");
      return;
    }
    setVisitaBusy(true);
    try {
      const { data } = await api.post(`/api/estudios/${sel.id}/visita-virtual/iniciar/`, {
        meeting_url: url,
      });
      setVisitaVirtual(data || null);
      toast.success("Visita virtual iniciada.");
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.response?.data?.meeting_url?.[0] || "No se pudo iniciar la visita virtual.";
      toast.error(detail);
    } finally {
      setVisitaBusy(false);
    }
  };

  const finalizarVisitaVirtual = async () => {
    if (!sel?.id) return;
    setVisitaBusy(true);
    try {
      const { data } = await api.post(`/api/estudios/${sel.id}/visita-virtual/finalizar/`);
      setVisitaVirtual(data || null);
      toast.success("Visita virtual finalizada.");
    } catch (e) {
      const detail = e?.response?.data?.detail || "No se pudo finalizar la visita virtual.";
      toast.error(detail);
    } finally {
      setVisitaBusy(false);
    }
  };

  const openEstudio = async (id) => {
    try {
      setShowDisponibilidad(false);
      setShowReunionVirtual(false);
      setMeetingUrlDraft("");
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
      await loadVisitaVirtual(id);
      await loadAgendaEstudio(id);
      loadResumen(id); // no-await: carga en paralelo sin bloquear
      // Cargar evaluacion en paralelo (sin bloquear)
      api.get(`/api/estudios/${id}/evaluacion/`).then((r) => setEvaluacion(r.data)).catch(() => setEvaluacion(null));
      setDisponibilidadReunion(null);
      setSlots([]);
      setTab("CANDIDATO");
    } catch {
      setSel(null);
      setShowDisponibilidad(false);
      setShowReunionVirtual(false);
      setCentrales([]);
      setRefs({ laborales: [], personales: [] });
      setResumen(null);
      setVisitaVirtual(null);
      setEvaluacion(null);
      setAgendaEstudio({ reunion: null, fechaLimite: null, vencido: false, totalSlotsDisponibles: 0, mensaje: "" });
      setDisponibilidadReunion(null);
      setSlots([]);
    }
  };

  useEffect(() => {
    load();
    loadAgendaGlobal();
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

  useEffect(() => {
    if (!sel?.id || (visitaVirtual?.estado || "").toUpperCase() !== "ACTIVA") return;
    const timer = setInterval(() => {
      loadVisitaVirtual(sel.id);
    }, 12000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id, visitaVirtual?.estado]);

  useEffect(() => {
    setEstudiosPage(1);
  }, [vistaEstudios, estudiosFiltrados.length]);

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

  const CONSENT_LABEL = {
    GENERAL:   "Autorización tratamiento de datos",
    CENTRALES: "Consulta centrales de riesgo",
    ACADEMICO: "Verificación académica",
  };

  const descargarConsentPdf = async (tipo) => {
    if (!sel?.id) return;
    const url = `/api/estudios/${sel.id}/consentimientos/pdf/${tipo ? `?tipo=${tipo}` : ""}`;
    const filename = tipo
      ? `Consentimiento_${tipo}_Estudio${sel.id}.pdf`
      : `Consentimientos_Estudio${sel.id}.pdf`;
    try {
      const { data, headers } = await api.get(url, { responseType: "blob" });
      const blob = new Blob([data], { type: headers?.["content-type"] || "application/pdf" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error("No se pudo descargar el documento.");
    }
  };

  const ConsentimientosMini = () => {
    const cons = sel?.consentimientos || [];
    if (!cons.length) return <div className="text-sm text-white/60">Sin registros</div>;
    const firmados = cons.filter((c) => c.aceptado);

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

    const [reseteando, setReseteando] = useState(false);
    const resetearConsentimientos = async () => {
      if (!sel?.id) return;
      if (!window.confirm("¿Seguro que deseas reiniciar los consentimientos? El candidato deberá volver a firmarlos todos.")) return;
      setReseteando(true);
      try {
        const { data } = await api.post(`/api/estudios/${sel.id}/resetear_consentimientos/`);
        toast.success(data.detail || "Consentimientos reiniciados.");
        await openEstudio(sel.id);
      } catch (e) {
        toast.error(e?.response?.data?.detail || "No se pudo reiniciar.");
      } finally {
        setReseteando(false);
      }
    };

    return (
      <div className="space-y-3">
        {/* Acciones de consentimientos */}
        <div className="flex flex-wrap gap-2">
          {firmados.length > 0 && (
            <button
              onClick={() => descargarConsentPdf("")}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
              </svg>
              Descargar todos
            </button>
          )}
          <button
            onClick={resetearConsentimientos}
            disabled={reseteando}
            className="flex items-center gap-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-600 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition"
            title="Reinicia todos los consentimientos para que el candidato vuelva a firmar"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {reseteando ? "Reiniciando..." : "Pedir nueva firma"}
          </button>
        </div>

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
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold">
                    {CONSENT_LABEL[c.tipo] || String(c.tipo || "").toUpperCase()}
                    {" · "}
                    <span className={c.aceptado ? "text-emerald-400" : "text-amber-400"}>
                      {c.aceptado ? "Firmado" : "Pendiente"}
                    </span>
                  </div>
                  {c.firmado_at && (
                    <div className="text-[11px] text-white/50 mt-0.5">
                      {new Date(c.firmado_at).toLocaleString()}
                    </div>
                  )}
                </div>
                {c.aceptado && (
                  <button
                    onClick={() => descargarConsentPdf(c.tipo)}
                    title="Descargar formato firmado"
                    className="flex items-center gap-1 rounded-lg border border-white/15 hover:bg-white/10 px-2 py-1 text-[11px] text-white/80 transition shrink-0"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                    </svg>
                    PDF
                  </button>
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

    // Nuevo: ¿es propietario?
    const isOwner = !!sel?.es_propietario;
    return (
      <Box
        title="📝 Referencias"
        right={
          !isClosed && isOwner && (
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
                    disabled={isClosed || !isOwner}
                  />
                  <input
                    className={inputClass}
                    placeholder="Cargo de quien referencia"
                    value={r.cargo || ""}
                    onChange={(e) => updLab(i, "cargo", e.target.value)}
                    disabled={isClosed || !isOwner}
                  />
                </div>
                {!isClosed && isOwner && (
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
            {!isClosed && isOwner && (
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
                    disabled={isClosed || !isOwner}
                  />
                  <input
                    className={inputClass}
                    placeholder="Familiar (parentesco)"
                    value={r.familiar || ""}
                    onChange={(e) => updPer(i, "familiar", e.target.value)}
                    disabled={isClosed || !isOwner}
                  />
                </div>
                {!isClosed && isOwner && (
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
            {!isClosed && isOwner && (
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
        <AppNavbar
          title="Panel del analista"
          subtitle="Gestiona y valida los estudios de seguridad."
          right={
            <div className="flex items-center gap-2">
              {/* Mi Agenda */}
              <button
                onClick={() => setShowAgenda((v) => !v)}
                title="Mi Agenda"
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  showAgenda
                    ? "border-sky-400/50 bg-sky-500/25 text-sky-200"
                    : "border-sky-400/25 bg-sky-500/10 text-sky-300/80 hover:bg-sky-500/20 hover:text-sky-200"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Mi Agenda
              </button>

              {/* Ampliar / contraer detalle — solo ícono */}
              <button
                onClick={() => setWide((w) => !w)}
                title={wide ? "Vista doble" : "Ampliar detalle"}
                className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90 transition"
              >
                {wide ? (
                  /* Contraer: dos columnas → una */
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                  </svg>
                ) : (
                  /* Ampliar: expandir */
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                  </svg>
                )}
              </button>

              <NotificacionesBell />
            </div>
          }
        />

        {/* â”€â”€ Panel de agenda global del analista (calendario interactivo) â”€â”€ */}
        {showAgenda && (() => {
          const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
          const DIAS_HDR = ['L','M','X','J','V','S','D'];
          const calDays = getCalendarDays(calendarMonth);
          const hoy = new Date(); hoy.setHours(0,0,0,0);
          const cmYear = calendarMonth.getFullYear();
          const cmMonth = calendarMonth.getMonth();
          const daysWithSlots = new Set(agendaGlobal.map(s => s.fecha));
          const selDayStr = calendarSelectedDay ? toFechaStr(calendarSelectedDay) : null;
          const todayStr = toFechaStr(hoy);

          return (
            <div className="rounded-3xl border border-sky-400/20 bg-gradient-to-br from-sky-950/60 to-indigo-950/60 p-5 shadow-2xl backdrop-blur-md space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sky-200 text-base tracking-tight">Mi disponibilidad para reuniones</div>
                  <div className="text-xs text-white/50 mt-0.5">
                    Selecciona un día · elige horas · cada slot dura <span className="text-sky-300 font-semibold">1 hora</span> exacta.
                  </div>
                </div>
                <button onClick={() => setShowAgenda(false)} className="w-7 h-7 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/10 transition text-sm">✕</button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[270px_1fr] gap-4">

                {/* â”€â”€ Mini calendario â”€â”€ */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2 flex-shrink-0">
                  {/* Navegación de mes */}
                  <div className="flex items-center justify-between px-1 mb-1">
                    <button
                      onClick={() => { const d = new Date(calendarMonth); d.setMonth(d.getMonth()-1); setCalendarMonth(d); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition text-xs"
                    >◀</button>
                    <span className="text-sm font-semibold text-white/80 capitalize">{MESES[cmMonth]} {cmYear}</span>
                    <button
                      onClick={() => { const d = new Date(calendarMonth); d.setMonth(d.getMonth()+1); setCalendarMonth(d); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition text-xs"
                    >▶</button>
                  </div>

                  {/* Cabeceras días semana */}
                  <div className="grid grid-cols-7 text-center mb-0.5">
                    {DIAS_HDR.map(d => (
                      <div key={d} className="text-[10px] text-white/30 font-bold py-0.5">{d}</div>
                    ))}
                  </div>

                  {/* Grid de días */}
                  <div className="grid grid-cols-7 gap-0.5">
                    {calDays.map((day, i) => {
                      const inMonth = day.getMonth() === cmMonth;
                      const isPast = day < hoy;
                      const fechaStr = toFechaStr(day);
                      const hasSlot = daysWithSlots.has(fechaStr);
                      const isSelected = selDayStr === fechaStr;
                      const isToday = fechaStr === todayStr;
                      return (
                        <button
                          key={i}
                          onClick={() => !isPast && inMonth && setCalendarSelectedDay(new Date(day))}
                          disabled={isPast || !inMonth}
                          className={`relative flex flex-col items-center justify-center rounded-lg py-1.5 text-xs font-medium transition select-none
                            ${!inMonth ? 'opacity-0 pointer-events-none' : ''}
                            ${inMonth && isPast ? 'text-white/20 cursor-default' : ''}
                            ${inMonth && !isPast ? 'text-white/70 hover:bg-sky-500/20 hover:text-white cursor-pointer' : ''}
                            ${isSelected ? '!bg-sky-500/50 !text-white ring-1 ring-sky-400/70' : ''}
                            ${isToday && !isSelected ? 'ring-1 ring-white/25' : ''}
                          `}
                        >
                          <span>{day.getDate()}</span>
                          {hasSlot && inMonth && !isPast && (
                            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400"></span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Leyenda */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 px-1 border-t border-white/8">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block flex-shrink-0"></span>
                      <span className="text-[10px] text-white/40">Tiene slots</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-md ring-1 ring-white/25 inline-block flex-shrink-0"></span>
                      <span className="text-[10px] text-white/40">Hoy</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-md bg-sky-500/50 ring-1 ring-sky-400/70 inline-block flex-shrink-0"></span>
                      <span className="text-[10px] text-white/40">Seleccionado</span>
                    </div>
                  </div>
                </div>

                {/* â”€â”€ Panel de horas â”€â”€ */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  {!calendarSelectedDay ? (
                    <div className="flex flex-col items-center justify-center h-full py-10 text-white/30 space-y-2">
                      <div className="text-4xl">📅</div>
                      <div className="text-sm italic">Selecciona un día del calendario</div>
                      <div className="text-xs text-white/20">Verás las horas disponibles aquí</div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="text-sm font-semibold text-white/80 capitalize">
                          {calendarSelectedDay.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-white/35">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-white/10 inline-block"></span>Sin slot</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/30 inline-block border border-emerald-400/40"></span>Disponible</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500/30 inline-block border border-amber-400/40"></span>Reservado</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-500/30 inline-block border border-slate-400/40"></span>Realizado o vencido</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-2">
                        {HORAS_AGENDA.map(hora => {
                          const slot = getSlotForCell(calendarSelectedDay, hora);
                          const estadoVisual = slot?.estado_visual || slot?.estado;
                          const isDisp = estadoVisual === 'DISPONIBLE';
                          const isRes = estadoVisual === 'RESERVADO';
                          const isRealizado = estadoVisual === 'REALIZADO';
                          const isVencido = estadoVisual === 'VENCIDO';
                          const isCan = estadoVisual === 'CANCELADO';
                          const puedeEliminar = isDisp || isCan || isVencido;
                          const detalleSlot = slot?.candidato_nombre
                            ? `${slot.candidato_nombre}${slot.estudio_reservado_numero ? ` · #${slot.estudio_reservado_numero}` : ""}`
                            : slot?.estudio_reservado_numero
                              ? `Estudio #${slot.estudio_reservado_numero}`
                              : "";
                          return (
                            <button
                              key={hora}
                              disabled={agendaBusy || isRes || isRealizado}
                              onClick={() => {
                                if (!slot) agregarSlotCalendario(calendarSelectedDay, hora);
                                else if (puedeEliminar) eliminarAgendaSlot(slot.id);
                              }}
                              title={
                                isRes ? `${detalleSlot || "Horario reservado"} — no se puede eliminar` :
                                isRealizado ? `${detalleSlot || "Horario realizado"} — se conserva como histórico` :
                                isVencido ? 'Horario vencido. Puedes eliminarlo de tu agenda.' :
                                slot ? 'Clic para eliminar este horario' :
                                'Clic para agregar disponibilidad'
                              }
                              className={`rounded-xl py-3 px-2 text-center text-xs font-medium transition-all border flex flex-col items-center gap-1 group min-h-[88px]
                                ${!slot ? 'border-white/10 bg-white/5 text-white/50 hover:bg-sky-500/20 hover:border-sky-400/50 hover:text-sky-200' : ''}
                                ${isDisp ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300 hover:bg-rose-500/15 hover:border-rose-400/40 hover:text-rose-300' : ''}
                                ${isRes ? 'border-amber-400/40 bg-amber-500/15 text-amber-300 cursor-not-allowed' : ''}
                                ${isRealizado ? 'border-slate-400/40 bg-slate-500/20 text-slate-200 cursor-not-allowed' : ''}
                                ${isVencido ? 'border-slate-400/30 bg-slate-500/10 text-slate-300 hover:bg-rose-500/15 hover:border-rose-400/40 hover:text-rose-200' : ''}
                                ${isCan ? 'border-white/5 bg-white/3 text-white/25 line-through' : ''}
                                ${agendaBusy ? 'opacity-50 pointer-events-none' : ''}
                              `}
                            >
                              <span className="font-bold text-sm leading-none">{hora}</span>
                              <span className={`text-[9px] leading-none transition-all
                                ${!slot ? 'text-white/30 group-hover:text-sky-300/80' : ''}
                                ${isDisp ? 'text-emerald-400/70 group-hover:text-rose-400/70' : ''}
                                ${isRes ? 'text-amber-400/70' : ''}
                                ${isRealizado ? 'text-slate-200/80' : ''}
                                ${isVencido ? 'text-slate-300/80 group-hover:text-rose-200/80' : ''}
                                ${isCan ? 'text-white/20' : ''}
                              `}>
                                {!slot ? '+ agregar' : isDisp ? 'Disponible' : isRes ? 'Reservado' : isRealizado ? 'Realizado' : isVencido ? 'Vencido' : 'Cancelado'}
                              </span>
                              {slot && detalleSlot && (
                                <span className="max-w-full truncate text-[9px] text-white/60">
                                  {detalleSlot}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

              </div>
            </div>
          );
        })()}

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
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Estudios</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setVistaEstudios("ASIGNADOS")}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                      vistaEstudios === "ASIGNADOS"
                        ? "bg-blue-600/80 border-blue-500 text-white"
                        : "bg-white/5 border-white/15 text-white/80 hover:bg-white/10"
                    }`}
                  >
                    Asignados
                  </button>
                  <button
                    onClick={() => setVistaEstudios("NO_ASIGNADOS")}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                      vistaEstudios === "NO_ASIGNADOS"
                        ? "bg-amber-600/80 border-amber-500 text-white"
                        : "bg-white/5 border-white/15 text-white/80 hover:bg-white/10"
                    }`}
                  >
                    No asignado
                  </button>
                </div>
              </div>
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
                    const noPropio = es.es_propietario === false;
                    const recurrente = !!es.alerta_estudio_recurrente;
                    return (
                      <button
                        key={es.id}
                        onClick={() => openEstudio(es.id)}
                        className={`w-full text-left p-4 border-b border-white/10 last:border-b-0 transition
                          ${sel?.id === es.id ? "bg-white/5" : "hover:bg-white/5"}
                          ${noPropio ? "bg-gray-700/40 text-gray-300 hover:bg-gray-700/60" : ""}
                          ${recurrente ? "ring-1 ring-amber-400/30 bg-amber-500/10" : ""}`}
                        style={noPropio ? { opacity: 0.7, filter: 'grayscale(0.5)' } : {}}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className={`font-semibold ${noPropio ? "text-gray-300" : ""}`}>#{es.id} - {nombre} {apellido}</span>
                            {!!es.nivel_cualitativo && (
                              <Badge color={riesgoColor(es.nivel_cualitativo)}>
                                {es.nivel_cualitativo}
                              </Badge>
                            )}
                            {typeof es.score_cuantitativo === "number" && (
                              <span className={`ml-2 text-xs font-semibold rounded-full px-2 py-0.5 ${noPropio ? "bg-gray-500/20 text-gray-300" : "text-blue-300 bg-blue-500/10"}`}>
                                {Math.round(es.score_cuantitativo)}%
                              </span>
                            )}
                            {recurrente && (
                              <span className="ml-1 text-[11px] font-semibold rounded-full px-2 py-0.5 text-amber-200 bg-amber-500/20 ring-1 ring-amber-400/30">
                                Historial previo
                              </span>
                            )}
                          </div>
                          <span className={`text-xs ${noPropio ? "text-gray-400" : "text-white/60"}`}>{Math.round(progress)}%</span>
                        </div>
                        <div className="mt-2">
                          <MiniBar value={progress} />
                        </div>
                        {empresa && (
                          <div className={`mt-1 text-xs font-medium ${noPropio ? "text-gray-400" : "text-white/60"}`}>{empresa}</div>
                        )}
                        {noPropio && (
                          <div className="mt-1 text-xs text-gray-400 italic">No asignado</div>
                        )}
                        {recurrente && (
                          <div className="mt-1 text-xs text-amber-200/90">
                            Alerta: {es.estudios_previos_count || 0} estudio(s) previo(s) para esta cédula
                            {es.ultimo_estudio_previo_id ? ` · Base migrada desde #${es.ultimo_estudio_previo_id}` : ""}
                          </div>
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

                {!loading && !estudiosFiltrados.length && (
                  <div className="p-4 text-sm text-white/70">
                    {vistaEstudios === "NO_ASIGNADOS" ? "No hay estudios no asignados." : "No hay estudios asignados."}
                  </div>
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
              visitaVirtual={visitaVirtual}
              meetingUrlDraft={meetingUrlDraft}
              setMeetingUrlDraft={setMeetingUrlDraft}
              iniciarVisitaVirtual={iniciarVisitaVirtual}
              finalizarVisitaVirtual={finalizarVisitaVirtual}
              visitaBusy={visitaBusy}
              tab={tab}
              setTab={setTab}
              resumen={resumen}
              evaluacion={evaluacion}
              agendaEstudio={agendaEstudio}
              agendaEstudioBusy={agendaEstudioBusy}
              cancelarReunionAgendada={cancelarReunionAgendada}
              programarReunionVirtual={programarReunionVirtual}
              abrirAgenda={() => setShowAgenda(true)}
              disponibilidadReunion={disponibilidadReunion}
              showDisponibilidad={showDisponibilidad}
              setShowDisponibilidad={setShowDisponibilidad}
              showReunionVirtual={showReunionVirtual}
              setShowReunionVirtual={setShowReunionVirtual}
              slots={slots}
              slotForm={slotForm}
              setSlotForm={setSlotForm}
              slotBusy={slotBusy}
              agregarSlot={agregarSlot}
              eliminarSlot={eliminarSlot}
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
            visitaVirtual={visitaVirtual}
            meetingUrlDraft={meetingUrlDraft}
            setMeetingUrlDraft={setMeetingUrlDraft}
            iniciarVisitaVirtual={iniciarVisitaVirtual}
            finalizarVisitaVirtual={finalizarVisitaVirtual}
            visitaBusy={visitaBusy}
            tab={tab}
            setTab={setTab}
            resumen={resumen}
            evaluacion={evaluacion}
            agendaEstudio={agendaEstudio}
            agendaEstudioBusy={agendaEstudioBusy}
            cancelarReunionAgendada={cancelarReunionAgendada}
            programarReunionVirtual={programarReunionVirtual}
            abrirAgenda={() => setShowAgenda(true)}
            disponibilidadReunion={disponibilidadReunion}
            showDisponibilidad={showDisponibilidad}
            setShowDisponibilidad={setShowDisponibilidad}
            showReunionVirtual={showReunionVirtual}
            setShowReunionVirtual={setShowReunionVirtual}
            slots={slots}
            slotForm={slotForm}
            setSlotForm={setSlotForm}
            slotBusy={slotBusy}
            agregarSlot={agregarSlot}
            eliminarSlot={eliminarSlot}
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
  visitaVirtual,
  meetingUrlDraft,
  setMeetingUrlDraft,
  iniciarVisitaVirtual,
  finalizarVisitaVirtual,
  visitaBusy,
  tab,
  setTab,
  resumen,
  evaluacion,
  agendaEstudio,
  agendaEstudioBusy,
  cancelarReunionAgendada,
  programarReunionVirtual,
  abrirAgenda,
  disponibilidadReunion,
  showDisponibilidad,
  setShowDisponibilidad,
  showReunionVirtual,
  setShowReunionVirtual,
  slots = [],
  slotForm,
  setSlotForm,
  slotBusy,
  agregarSlot,
  eliminarSlot,
  TabCandidato,
  TabPorTipo,
  TabCentrales,
  TabPatrimonio,
  TabReferencias,
  TabInfoFamiliar,
  TabDescripcionVivienda,
  TabListasRestrictivas,
}) {
  const isOwner = !!sel?.es_propietario;
  const fill = resumen?.fill_candidato || {};
  const reunionActiva = agendaEstudio?.reunion && ["PENDIENTE", "CONFIRMADA"].includes(agendaEstudio.reunion.estado);
  const visitaActiva = (visitaVirtual?.estado || "").toUpperCase() === "ACTIVA";
  const reunionProgramada = (agendaEstudio?.reunion?.meeting_url || "").trim();
  const draftLimpio = (meetingUrlDraft || "").trim();
  const draftCambio = !!draftLimpio && draftLimpio !== reunionProgramada;
  const formatearFecha = (valor) => {
    if (!valor) return "—";
    return new Date(`${valor}T00:00:00`).toLocaleDateString("es-CO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };
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
              className="mb-3 p-4 border border-red-400/30 bg-red-500/10 shadow-xl rounded-xl backdrop-blur-md"
            >
              <span className="text-red-300 font-semibold text-base flex items-start gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mt-0.5 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  Este estudio fue creado bajo consideración del cliente. Los criterios seleccionados como no relevantes fueron configurados por el cliente y el resultado debe ser interpretado bajo esa política.
                  {Array.isArray(sel.politicas_no_relevantes) && sel.politicas_no_relevantes.length > 0 && (
                    <span className="block mt-1 font-normal text-sm text-red-400/80">
                      Criterios no relevantes: ({sel.politicas_no_relevantes.join(", ")})
                    </span>
                  )}
                </span>
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
              {isOwner && (
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
              )}
            </div>
          </div>

          {sel.observacion_analista && (
            <div className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-400/20 rounded-lg px-2 py-1">
              Observación enviada: {sel.observacion_analista}
            </div>
          )}

          <div className="flex flex-wrap gap-2 items-center">
            {!isClosed ? (
              isOwner && <>
                <span className="text-base font-semibold text-white mr-2">Concepto Final</span>
                <div className="p-[1.5px] rounded-lg bg-gradient-to-r from-transparent via-yellow-500/90 to-transparent">
                  <button
                    onClick={devolver}
                    disabled={devolviendo}
                    className="rounded-xl px-4 py-2 text-sm font-medium text-white bg-slate-700 border-2 border-slate-600 hover:border-amber-500 hover:shadow-[0_0_10px_2px_rgba(245,158,11,0.4)] transition disabled:opacity-60"
                  >
                    {devolviendo && (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                      </svg>
                    )}
                    {devolviendo ? "Devolviendo…" : "Devolver"}
                  </button>
                </div>
                <div className="p-[1.5px] rounded-lg bg-gradient-to-r from-transparent via-emerald-500/80 to-transparent">
                  <button
                    onClick={() => openDecidir("APTO")}
                    className="rounded-xl px-4 py-2 text-sm font-medium text-white bg-slate-700 border-2 border-slate-600 hover:border-emerald-500 hover:shadow-[0_0_10px_2px_rgba(16,185,129,0.4)] transition"
                  >
                    Cerrar: APTO
                  </button>
                </div>
                <div className="p-[1.5px] rounded-lg bg-gradient-to-r from-transparent via-rose-500/80 to-transparent">
                  <button
                    onClick={() => openDecidir("NO_APTO")}
                    className="rounded-xl px-4 py-2 text-sm font-medium text-white bg-slate-700 border-2 border-slate-600 hover:border-rose-500 hover:shadow-[0_0_10px_2px_rgba(244,63,94,0.4)] transition"
                  >
                    Cerrar: NO APTO
                  </button>
                </div>
                {/* Botón especial para aprobación bajo consideración del cliente */}
                {sel.a_consideracion_cliente && (
                  <div className="p-[1.5px] rounded-lg bg-gradient-to-r from-transparent via-yellow-500/90 to-transparent">
                    <button
                      onClick={() => openDecidir("APTO_CONSIDERACION")}
                      className="rounded-xl px-4 py-2 text-sm font-medium text-white bg-slate-700 border-2 border-slate-600 hover:border-amber-500 hover:shadow-[0_0_10px_2px_rgba(245,158,11,0.4)] transition"
                    >
                      Aprobar bajo consideración del cliente
                    </button>
                  </div>
                )}
              </>
            ) : (
              <span className="text-sm text-white/70">
                Estudio cerrado el{" "}
                {sel.finalizado_at ? new Date(sel.finalizado_at).toLocaleString() : "—"}
              </span>
            )}
          </div>

          {/* Disponibilidad al candidato — colapsable */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowDisponibilidad((v) => !v)}
              aria-expanded={showDisponibilidad}
              className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                showDisponibilidad
                  ? "border-violet-400/30 bg-gradient-to-r from-violet-600/20 to-indigo-600/20 shadow-lg shadow-violet-950/20"
                  : "border-violet-400/20 bg-violet-500/10 hover:bg-violet-500/15"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-500/15 text-violet-200 text-sm font-semibold flex-shrink-0">
                  D
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-violet-100 tracking-tight">Disponibilidad</div>
                  <div className="text-xs text-violet-200/70 truncate">
                    {reunionActiva
                      ? `Reservada para ${agendaEstudio.reunion.slot?.fecha} a las ${agendaEstudio.reunion.slot?.hora_inicio?.slice(0, 5)}`
                      : agendaEstudio?.totalSlotsDisponibles > 0
                        ? `${agendaEstudio.totalSlotsDisponibles} horario${agendaEstudio.totalSlotsDisponibles === 1 ? "" : "s"} disponibles`
                        : "Sin horarios disponibles"}
                  </div>
                </div>
              </div>
              <span className="text-violet-200/80 text-lg leading-none">
                {showDisponibilidad ? "v" : ">"}
              </span>
            </button>

            {showDisponibilidad && (
              <div className="rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-950/50 to-indigo-950/50 p-3 text-white overflow-hidden space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Estudio habilitado</div>
                    <div className="mt-1 text-lg font-semibold text-white">{sel?.habilitado_candidato_at ? "Si" : "No"}</div>
                    <div className="mt-1 text-xs text-white/55">
                      {sel?.habilitado_candidato_at ? "Desde aqui corre el plazo para agendar." : "Invita al candidato para habilitar el agendamiento."}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Fecha limite</div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {agendaEstudio?.fechaLimite ? formatearFecha(agendaEstudio.fechaLimite) : "Pendiente"}
                    </div>
                    <div className="mt-1 text-xs text-white/55">
                      {agendaEstudio?.vencido ? "La ventana para agendar ya vencio." : "Ventana maxima de 3 dias habiles para agendar."}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Agenda disponible</div>
                    <div className="mt-1 text-lg font-semibold text-white">{agendaEstudio?.totalSlotsDisponibles || 0} horarios</div>
                    <div className="mt-1 text-xs text-white/55">Se toma desde tu agenda global y se bloquea al reservarse.</div>
                  </div>
                </div>

                <div className="rounded-xl border border-violet-300/15 bg-violet-500/10 p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-violet-100">
                    Administra los horarios desde <span className="font-semibold">Mi Agenda</span>. Cada espacio dura exactamente 1 hora y sirve para todos tus estudios activos.
                  </div>
                  <button
                    type="button"
                    onClick={abrirAgenda}
                    className="rounded-xl border border-violet-300/20 bg-violet-500/20 px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/30"
                  >
                    Abrir Mi Agenda
                  </button>
                </div>

                {reunionActiva ? (
                  <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-emerald-200">Horario tomado por el candidato</div>
                      <Badge color={agendaEstudio.reunion.estado === "CONFIRMADA" ? "green" : "amber"}>
                        {agendaEstudio.reunion.estado}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-emerald-100/90">
                      <span>Fecha: {agendaEstudio.reunion.slot?.fecha}</span>
                      <span>Hora: {agendaEstudio.reunion.slot?.hora_inicio?.slice(0, 5)} - {agendaEstudio.reunion.slot?.hora_fin?.slice(0, 5)}</span>
                    </div>
                    {agendaEstudio.reunion.nota && (
                      <div className="text-xs text-emerald-100/70">Nota del candidato: {agendaEstudio.reunion.nota}</div>
                    )}
                    <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-xs text-emerald-100/80 space-y-1">
                      <div className="font-semibold text-emerald-200">Enlace de reunion</div>
                      {reunionProgramada ? (
                        <div className="break-all">{reunionProgramada}</div>
                      ) : agendaEstudio.reunion.google_calendar_url ? (
                        <div>Abre Google Calendar, crea la reunion y luego pega aqui el link final para compartirlo con el candidato.</div>
                      ) : (
                        <div>El enlace de la reunion se mostrara aqui cuando quede disponible.</div>
                      )}
                    </div>
                    {!!agendaEstudio.reunion.google_calendar_url && (
                      <div className="space-y-2 rounded-xl border border-sky-300/20 bg-sky-500/10 p-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200/80">
                          Programacion manual
                        </div>
                        <div className="text-xs text-sky-100/80">
                          1. Abre Google Calendar. 2. Guarda el evento con Meet. 3. Pega el link generado para enviarlo al candidato, analista y cliente.
                        </div>
                        <input
                          type="text"
                          value={meetingUrlDraft}
                          onChange={(e) => {
                            const raw = e.target.value;
                            // Si el texto tiene saltos de línea o espacios (texto copiado de invitación),
                            // extraer el primer link https://meet.google.com/... o el primer https:// encontrado
                            if (raw.includes("\n") || raw.includes(" ")) {
                              const meetMatch = raw.match(/https:\/\/meet\.google\.com\/[^\s]+/);
                              if (meetMatch) {
                                setMeetingUrlDraft(meetMatch[0].replace(/[.,;]+$/, ""));
                                return;
                              }
                              const anyHttps = raw.match(/https?:\/\/[^\s]+/);
                              if (anyHttps) {
                                setMeetingUrlDraft(anyHttps[0].replace(/[.,;]+$/, ""));
                                return;
                              }
                            }
                            setMeetingUrlDraft(raw);
                          }}
                          placeholder="https://meet.google.com/..."
                          className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-sky-300/40"
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap justify-end gap-2">
                      {agendaEstudio.reunion.google_calendar_url ? (
                        <a
                          href={agendaEstudio.reunion.google_calendar_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-sky-300/40 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/10"
                        >
                          Abrir en Google Calendar
                        </a>
                      ) : null}
                      {!!agendaEstudio.reunion.google_calendar_url && (!reunionProgramada || draftCambio) && (
                        <button
                          type="button"
                          onClick={programarReunionVirtual}
                          disabled={agendaEstudioBusy || !draftLimpio}
                          className="rounded-xl border border-emerald-300/40 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/10 disabled:opacity-50"
                        >
                          {agendaEstudioBusy ? "Guardando..." : reunionProgramada ? "Actualizar programacion" : "Guardar programacion"}
                        </button>
                      )}
                      {reunionProgramada && !visitaActiva && (
                        <button
                          type="button"
                          onClick={iniciarVisitaVirtual}
                          disabled={visitaBusy}
                          className="rounded-xl bg-emerald-600/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                        >
                          {visitaBusy ? "Iniciando..." : "Iniciar visita"}
                        </button>
                      )}
                      {reunionProgramada && visitaActiva && (
                        <a
                          href={reunionProgramada}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-emerald-300/40 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/10"
                        >
                          Abrir reunion
                        </a>
                      )}
                      {visitaActiva && (
                        <button
                          type="button"
                          onClick={finalizarVisitaVirtual}
                          disabled={visitaBusy}
                          className="rounded-xl border border-amber-300/40 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/10 disabled:opacity-50"
                        >
                          {visitaBusy ? "Finalizando..." : "Finalizar visita"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={cancelarReunionAgendada}
                        disabled={agendaEstudioBusy}
                        className="rounded-xl bg-rose-600/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-50"
                      >
                        {agendaEstudioBusy ? "Liberando..." : "Liberar horario"}
                      </button>
                    </div>

                    {/* Ubicacion en tiempo real del candidato - solo cuando visita ACTIVA */}
                    {visitaActiva && (
                      <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 space-y-1.5">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-xs font-semibold text-violet-200">Ubicación del candidato</span>
                          </div>
                          {visitaVirtual?.consentida_por_candidato ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">Consentida</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">Esperando consentimiento</span>
                          )}
                        </div>
                        {visitaVirtual?.ultima_latitud && visitaVirtual?.ultima_longitud ? (
                          <>
                            <div className="text-xs text-white/55">
                              Lat: {Number(visitaVirtual.ultima_latitud).toFixed(5)} — Lng: {Number(visitaVirtual.ultima_longitud).toFixed(5)}
                              {visitaVirtual.ultima_precision_m && ` (±${Math.round(visitaVirtual.ultima_precision_m)} m)`}
                            </div>
                            <a
                              href={`https://www.google.com/maps?q=${visitaVirtual.ultima_latitud},${visitaVirtual.ultima_longitud}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block mt-1 px-3 py-1 rounded-full text-xs font-semibold border border-violet-300/30 text-violet-100 hover:bg-violet-400/15 transition"
                            >
                              Ver en Google Maps
                            </a>
                          </>
                        ) : (
                          <div className="text-xs text-white/40 italic">
                            {visitaVirtual?.consentida_por_candidato
                              ? "Esperando primera señal de ubicación del candidato…"
                              : "El candidato aún no ha aceptado compartir su ubicación."}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/75">
                    {agendaEstudio?.mensaje ||
                      (agendaEstudio?.vencido
                        ? "El plazo de agendamiento ya vencio para este estudio."
                        : sel?.habilitado_candidato_at
                          ? "El candidato todav?a no ha reservado un horario para este estudio."
                          : "Invita al candidato para abrir su ventana de agendamiento.")}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="mt-1">
            <div className="flex flex-wrap gap-2">
              {[
                ["CANDIDATO", "Candidato", "BIOGRAFICOS"],
                ["DOCS", "Docs", "DOCUMENTOS"],
                ["ACADEMICO", "Académico", "ACADEMICO"],
                ["LABORAL", "Laboral", "LABORAL"],
                ["ECONOMICA", "Económica", "ECONOMICA"],
                ["PATRIMONIO", "Patrimonio", "PATRIMONIO"],
                ["ANEXOS", "Anexos", "ANEXOS_FOTOGRAFICOS"],
                ["CENTRALES", "Centrales", null],
                ["LISTAS_RESTRICTIVAS", "Listas Restrictivas", "LISTAS_RESTRICTIVAS"],
                ["REFERENCIAS", "Referencias", "REFERENCIAS"],
                ["INFO_FAMILIAR", "Info Familiar", "INFO_FAMILIAR"],
                ["DESCRIPCION_VIVIENDA", "Descripción Vivienda", "VIVIENDA"],
              ].map(([key, label, fillKey]) => {
                const fillVal = fillKey ? fill[fillKey] : null;
                const dot = fillVal === true
                  ? "bg-emerald-400"
                  : fillVal === false
                  ? "bg-amber-400"
                  : null;
                return (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition
                      bg-slate-700 text-white/90
                      border-2
                      ${tab === key
                        ? "border-violet-500 shadow-[0_0_10px_2px_rgba(139,92,246,0.4)] bg-slate-800 text-violet-200"
                        : "border-slate-600 hover:border-violet-400 hover:shadow-[0_0_10px_2px_rgba(139,92,246,0.3)] hover:text-violet-200"}
                    `}
                  >
                    {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />}
                    {label}
                  </button>
                );
              })}
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

            {/* Evaluación de trato del candidato */}
            {evaluacion?.respondida_at && (
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="font-semibold text-sm mb-2">Evaluación de trato (candidato)</div>
                <div className="space-y-2 text-xs text-white/80">
                  {[
                    ["Trato analista", evaluacion.trato_analista],
                    ["Claridad proceso", evaluacion.claridad_proceso],
                    ["Tiempo respuesta", evaluacion.tiempo_respuesta],
                    ["Profesionalismo", evaluacion.profesionalismo],
                    ["Resultado esperado", evaluacion.resultado_esperado],
                    ["Recomendaria", evaluacion.recomendaria],
                  ].map(([label, val]) =>
                    val != null ? (
                      <div key={label} className="flex justify-between">
                        <span className="text-white/50">{label}:</span>
                        <span>{val}</span>
                      </div>
                    ) : null
                  )}
                  {evaluacion.comentario && (
                    <div className="mt-1 border-t border-white/10 pt-1">
                      <span className="text-white/50">Comentario: </span>{evaluacion.comentario}
                    </div>
                  )}
                </div>
              </div>
            )}
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
