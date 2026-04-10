// src/pages/CandidatoPortal.jsx
import { Outlet, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import ProgressBar from "../components/ProgressBar";
import ConsentWizard from "../components/ConsentWizard";
import ModulesNav from "../components/ModulesNav";
import ThreeBackground from "../components/ThreeBackground";
import AppNavbar from "../components/AppNavbar";
// ⬇️ nuevo: modal de evaluación
import EvaluacionTratoModal from "../components/EvaluacionTratoModal";

export default function CandidatoPortal() {
  const navigate = useNavigate();

  const [estudio, setEstudio] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [showConsent, setShowConsent] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [showEval, setShowEval] = useState(false); // ⬅️ nuevo
  const [visitaVirtual, setVisitaVirtual] = useState(null);
  const [geoSharing, setGeoSharing] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const geoWatchRef = useRef(null);
  const lastGeoPushRef = useRef(0);
  const [showGeoConsent, setShowGeoConsent] = useState(false);

  // Slots del analista y selección del candidato (sistema legacy)
  const [slots, setSlots] = useState([]);
  const [disponibilidad, setDisponibilidad] = useState(null);
  const [slotSeleccionadoId, setSlotSeleccionadoId] = useState(null);
  const [notaSlot, setNotaSlot] = useState("");
  const [dispBusy, setDispBusy] = useState(false);
  const [dispMsg, setDispMsg] = useState("");

  // Nuevo sistema de agendamiento tipo cita médica
  const [reunionInfo, setReunionInfo] = useState(null);          // { reunion, fecha_limite, vencido }
  const [slotsDisponibles, setSlotsDisponibles] = useState([]);  // slots libres del analista
  const [reunionFechaLimite, setReunionFechaLimite] = useState(null);
  const [reunionVencido, setReunionVencido] = useState(false);
  const [reunionSlotId, setReunionSlotId] = useState(null);
  const [reunionNota, setReunionNota] = useState("");
  const [reunionBusy, setReunionBusy] = useState(false);
  const [reunionMsg, setReunionMsg] = useState("");
  const [reunionAviso, setReunionAviso] = useState("");
  const [fechaFiltro, setFechaFiltro] = useState(null); // fecha seleccionada en el calendario

  // “pin” local para que el progreso no baje cuando el estudio está congelado
  const progressPinRef = useRef(null);
  const closeTimerRef = useRef(null);

  // ¿está cerrado realmente?
  const isClosed = useMemo(() => {
    const s = (estudio?.estado || "").toUpperCase();
    const d = (estudio?.decision_final || "").toUpperCase();
    return s === "CERRADO" || Boolean(estudio?.finalizado_at) || d === "APTO" || d === "NO_APTO";
  }, [estudio]);

  // ¿congelar barra?
  const freezeProgress = useMemo(() => {
    const s = (estudio?.estado || "").toUpperCase();
    return Boolean(estudio?.enviado_at) || s === "EN_REVISION" || isClosed;
  }, [estudio?.estado, estudio?.enviado_at, isClosed]);

  // progreso mostrado (congelado si aplica)
  const displayProgress = useMemo(() => {
    const current = Number(estudio?.progreso || 0);
    if (!freezeProgress) return current;
    if (progressPinRef.current == null || current > progressPinRef.current) {
      progressPinRef.current = current;
    }
    return progressPinRef.current;
  }, [estudio?.progreso, freezeProgress]);

  const stopGeoShare = () => {
    if (geoWatchRef.current != null && navigator?.geolocation?.clearWatch) {
      navigator.geolocation.clearWatch(geoWatchRef.current);
    }
    geoWatchRef.current = null;
    setGeoSharing(false);
  };

  const confirmGeoConsent = async () => {
    setShowGeoConsent(false);
    if (!estudio?.id) return;
    setGeoBusy(true);
    try {
      await api.post(`/api/estudios/${estudio.id}/visita-virtual/consentir/`);
      await loadVisitaVirtual(estudio.id);
      lastGeoPushRef.current = 0;
      geoWatchRef.current = navigator.geolocation.watchPosition(
        async (position) => {
          const now = Date.now();
          if (now - lastGeoPushRef.current < 10000) return;
          lastGeoPushRef.current = now;
          try {
            await api.post(`/api/estudios/${estudio.id}/visita-virtual/ubicacion/`, {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
            });
            await loadVisitaVirtual(estudio.id);
          } catch { /* silencioso */ }
        },
        () => {
          alert("No se pudo obtener tu ubicación. Verifica permisos del navegador.");
          stopGeoShare();
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
      setGeoSharing(true);
    } finally {
      setGeoBusy(false);
    }
  };

  const loadDisponibilidad = async (estudioId) => {
    try {
      const [{ data: slotsData }, { data: dispData }] = await Promise.all([
        api.get(`/api/estudios/${estudioId}/slots-analista/`),
        api.get(`/api/estudios/${estudioId}/disponibilidad-reunion/`),
      ]);
      setSlots(Array.isArray(slotsData) ? slotsData : []);
      if (dispData) {
        setDisponibilidad(dispData);
        setSlotSeleccionadoId(dispData.slot_seleccionado?.id || null);
        setNotaSlot(dispData.nota || "");
      }
    } catch {
      // sin slots aún
    }
  };

  const seleccionarSlot = async () => {
    if (!estudio?.id || !slotSeleccionadoId) {
      setDispMsg("Selecciona un horario.");
      return;
    }
    setDispBusy(true);
    setDispMsg("");
    try {
      const { data } = await api.post(`/api/estudios/${estudio.id}/seleccionar-slot/`, {
        slot_id: slotSeleccionadoId,
        nota: notaSlot,
      });
      setDisponibilidad(data);
      setDispMsg("¡Horario confirmado!");
    } catch (e) {
      setDispMsg(e?.response?.data?.detail || "Error al confirmar. Intenta de nuevo.");
    } finally {
      setDispBusy(false);
    }
  };

  // ── Nuevo sistema de agendamiento tipo cita médica ──

  const loadReunionAgendada = async (estudioId) => {
    try {
      const [{ data: reunionData }, { data: slotsData }] = await Promise.all([
        api.get(`/api/estudios/${estudioId}/reunion-agendada/`),
        api.get(`/api/estudios/${estudioId}/reunion-agendada/slots-disponibles/`),
      ]);
      // reunion-agendada puede retornar { reunion, fecha_limite } o el objeto directamente
      const reunion = reunionData?.slot ? reunionData : null;
      setReunionInfo(reunion);
      setReunionFechaLimite(reunionData?.fecha_limite || slotsData?.fecha_limite || null);
      setReunionVencido(slotsData?.vencido || false);
      setReunionAviso(slotsData?.mensaje || "");
      const slots = Array.isArray(slotsData?.slots) ? slotsData.slots : [];
      setSlotsDisponibles(slots);
      if (reunion) {
        setReunionSlotId(reunion.slot?.id || null);
        setReunionNota(reunion.nota || "");
      } else if (!slots.some((slot) => slot.fecha === fechaFiltro)) {
        setFechaFiltro(slots[0]?.fecha || null);
      }
    } catch {
      setReunionInfo(null);
      setReunionFechaLimite(null);
      setReunionVencido(false);
      setSlotsDisponibles([]);
      setReunionAviso("");
    }
  };

  const agendarReunionSlot = async () => {
    if (!estudio?.id || !reunionSlotId) {
      setReunionMsg("Selecciona un horario disponible.");
      return;
    }
    setReunionBusy(true);
    setReunionMsg("");
    try {
      const { data } = await api.post(`/api/estudios/${estudio.id}/reunion-agendada/agendar/`, {
        slot_id: reunionSlotId,
        nota: reunionNota,
      });
      setReunionInfo(data);
      setReunionMsg("¡Reunión agendada exitosamente!");
      await loadReunionAgendada(estudio.id);
    } catch (e) {
      setReunionMsg(e?.response?.data?.detail || "Error al agendar. Intenta de nuevo.");
    } finally {
      setReunionBusy(false);
    }
  };

  const cancelarReunionAgendada = async () => {
    if (!estudio?.id) return;
    setReunionBusy(true);
    setReunionMsg("");
    try {
      await api.post(`/api/estudios/${estudio.id}/reunion-agendada/cancelar/`);
      setReunionInfo(null);
      setReunionSlotId(null);
      setReunionMsg("Reunión cancelada. Puedes elegir otro horario.");
      await loadReunionAgendada(estudio.id);
    } catch (e) {
      setReunionMsg(e?.response?.data?.detail || "No se pudo cancelar.");
    } finally {
      setReunionBusy(false);
    }
  };

  const loadVisitaVirtual = async (estudioId) => {
    try {
      const { data } = await api.get(`/api/estudios/${estudioId}/visita-virtual/`);
      setVisitaVirtual(data || null);
      return data || null;
    } catch {
      setVisitaVirtual(null);
      return null;
    }
  };

  const startGeoShare = async () => {
    if (!estudio?.id) return;
    if (!navigator?.geolocation) {
      alert("Tu navegador no soporta geolocalización.");
      return;
    }
    if ((visitaVirtual?.estado || "").toUpperCase() !== "ACTIVA") {
      alert("No hay una visita virtual activa.");
      return;
    }

    setGeoBusy(true);
    try {
      if (!visitaVirtual?.consentida_por_candidato) {
        setGeoBusy(false);
        setShowGeoConsent(true);
        return;
      }

      lastGeoPushRef.current = 0;
      geoWatchRef.current = navigator.geolocation.watchPosition(
        async (position) => {
          const now = Date.now();
          if (now - lastGeoPushRef.current < 10000) return;
          lastGeoPushRef.current = now;
          try {
            await api.post(`/api/estudios/${estudio.id}/visita-virtual/ubicacion/`, {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
            });
            await loadVisitaVirtual(estudio.id);
          } catch {
            // silencioso para no interrumpir el watch por fallos intermitentes
          }
        },
        () => {
          alert("No se pudo obtener tu ubicación. Verifica permisos del navegador.");
          stopGeoShare();
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
      setGeoSharing(true);
    } finally {
      setGeoBusy(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setMsg("");
    try {
      const { data } = await api.get("/api/estudios/");
      const first = Array.isArray(data) && data.length ? data[0] : null;
      if (!first) {
        setEstudio(null);
        setVisitaVirtual(null);
        stopGeoShare();
        setShowConsent(false);
        setShowEval(false);
        setShowClosed(false);
        progressPinRef.current = null;
        return;
      }
      const { data: full } = await api.get(`/api/estudios/${first.id}/`);
      setEstudio(full);
      await loadVisitaVirtual(full.id);
      await loadReunionAgendada(full.id);

      // fijar pin si corresponde
      const s = (full.estado || "").toUpperCase();
      const d = (full.decision_final || "").toUpperCase();
      const willFreeze =
        Boolean(full.enviado_at) ||
        s === "EN_REVISION" ||
        s === "CERRADO" ||
        Boolean(full.finalizado_at) ||
        d === "APTO" ||
        d === "NO_APTO";
      progressPinRef.current = willFreeze ? Number(full.progreso || 0) : null;

      // consentimientos (solo si no está cerrado ni en evaluación)
      const cons = Array.isArray(full.consentimientos) ? full.consentimientos : [];
      const allConsOk = cons.length ? cons.every((c) => c.aceptado) : !!full.autorizacion_firmada;

      // ⬇️ prioridad a la evaluación si viene marcada por el backend
      const mustShowEval = Boolean(full.mostrar_evaluacion);
      setShowEval(mustShowEval);
      const closedNow = s === "CERRADO" || Boolean(full.finalizado_at) || d === "APTO" || d === "NO_APTO";

      // Si el analista resetea consentimientos, el wizard debe volver a mostrarse
      // aunque existan marcas locales anteriores.
      setShowConsent(!allConsOk && !closedNow && !mustShowEval);

      // aviso de cierre + redirección (solo si NO hay evaluación pendiente)
      const seenKey = `study:${full.id}:closedSeen`;
      if (closedNow && !mustShowEval && !localStorage.getItem(seenKey)) {
        setShowClosed(true);
        localStorage.setItem(seenKey, "1");
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = setTimeout(async () => {
          try { await api.post("/api/auth/logout/"); } catch {}
          navigate("/login");
        }, 4500);
      } else {
        setShowClosed(false);
        if (!closedNow) localStorage.removeItem(seenKey);
      }
    } catch (e) {
      console.error(e);
      setMsg("No se pudo cargar tu estudio.");
      setEstudio(null);
      setVisitaVirtual(null);
      stopGeoShare();
      setShowConsent(false);
      setShowEval(false);
      setShowClosed(false);
      progressPinRef.current = null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => {
      clearTimeout(closeTimerRef.current);
      stopGeoShare();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // progreso en vivo (evento global)
  useEffect(() => {
    const onProgress = (ev) => {
      const { estudioId, progreso } = ev.detail || {};
      setEstudio((s) => {
        if (!s || s.id !== estudioId) return s;
        const next = Number(progreso || 0);
        if (freezeProgress) {
          const pinned = progressPinRef.current ?? Number(s.progreso || 0);
          const safe = Math.max(pinned, next);
          progressPinRef.current = safe;
          return { ...s, progreso: safe };
        }
        return { ...s, progreso: next };
      });
    };
    window.addEventListener("estudio:progress", onProgress);
    return () => window.removeEventListener("estudio:progress", onProgress);
  }, [freezeProgress]);

  useEffect(() => {
    if ((visitaVirtual?.estado || "").toUpperCase() !== "ACTIVA") {
      stopGeoShare();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitaVirtual?.estado]);

  useEffect(() => {
    if (!estudio?.id || (visitaVirtual?.estado || "").toUpperCase() !== "ACTIVA") return;
    const timer = setInterval(() => {
      loadVisitaVirtual(estudio.id);
    }, 12000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estudio?.id, visitaVirtual?.estado]);

  const locked = useMemo(
    () => (estudio ? !estudio.editable_por_candidato : false),
    [estudio]
  );

  const enviar = async () => {
    if (!estudio) return;
    const ok = confirm("¿Enviar tu información para revisión? No podrás editar hasta que el analista la devuelva.");
    if (!ok) return;
    try {
      await api.post(`/api/estudios/${estudio.id}/enviar/`);
      await load();
    } catch (e) {
      const d = e.response?.data;
      const detail = d?.detail || d?.non_field_errors?.[0] || JSON.stringify(d || {});
      alert("No se pudo enviar el estudio: " + detail);
    }
  };

  // sólo mostramos badge de decisión si es un estado final real
  const showDecisionBadge = useMemo(() => {
    const d = (estudio?.decision_final || "").toUpperCase();
    return d === "APTO" || d === "NO_APTO";
  }, [estudio?.decision_final]);

  const formatearFecha = (valor) => {
    if (!valor) return "—";
    return new Date(`${valor}T00:00:00`).toLocaleDateString("es-CO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  return (
    <div className="relative min-h-screen">
      {/* Fondo */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(1200px_700px_at_25%_20%,rgba(255,255,255,0.08),transparent_60%),linear-gradient(180deg,#0b1220_0%,#0a0f1a_100%)]" />
      <ThreeBackground />

      <div className="mx-auto max-w-5xl p-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md shadow-2xl">
          {/* Header */}
          <div className="border-b border-white/10 p-4">
            <AppNavbar
              title="Portal del candidato"
              subtitle="Completa tu información y consulta el estado de tu estudio."
            />
          </div>
          <div className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
            <div>
            </div>

            {/* Estado del estudio */}
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white/90">
              {loading ? (
                <div className="text-sm text-white/60">Cargando…</div>
              ) : !estudio ? (
                <div className="text-sm text-white/60">No tienes un estudio activo.</div>
              ) : (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">Estudio</span>
                    <span className="rounded-lg bg-white/10 px-2 py-0.5 text-sm font-semibold">#{estudio.id}</span>
                    {estudio.estado && (
                      <span className="rounded-lg bg-blue-500/15 ring-1 ring-blue-400/25 px-2 py-0.5 text-xs text-blue-200">
                        {estudio.estado}
                      </span>
                    )}
                    {showDecisionBadge && (
                      <span
                        className={`rounded-lg ring-1 px-2 py-0.5 text-xs ${
                          estudio.decision_final === "APTO"
                            ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/25"
                            : "bg-rose-500/15 text-rose-200 ring-rose-400/25"
                        }`}
                      >
                        {estudio.decision_final}
                      </span>
                    )}
                  </div>

                  {estudio.observacion_analista && (
                    <div className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-400/20 rounded-lg px-2 py-1">
                      Observación del analista: {estudio.observacion_analista}
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-white/60">
                    Progreso: <span className="text-white/80">{Math.round(displayProgress || 0)}%</span>
                  </div>
                  <div className="pt-1">
                    <ProgressBar value={displayProgress || 0} />
                  </div>

                  {!locked && !isClosed && (
                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={enviar}
                        className={
                          `px-3 py-1.5 rounded-full text-sm font-semibold transition
                          bg-slate-700 text-white/90
                          border-2
                          border-slate-600 hover:border-violet-400 hover:shadow-[0_0_10px_2px_rgba(139,92,246,0.3)] hover:text-violet-200`
                        }
                      >
                        Enviar para revisión
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ══ Nuevo sistema de agendamiento tipo cita médica ══ */}
          {!loading && estudio && !isClosed && (
            <div className="mx-4 mb-3">
              <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 p-4 text-white space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm text-sky-200">Agendar reunión virtual de seguridad</div>
                  {reunionFechaLimite && (
                    <div className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      reunionVencido
                        ? "bg-rose-500/20 text-rose-300"
                        : "bg-sky-500/20 text-sky-300"
                    }`}>
                      {reunionVencido ? "Plazo vencido" : `Plazo: ${formatearFecha(reunionFechaLimite)}`}
                    </div>
                  )}
                </div>

                {/* Ya tiene reunión agendada y activa */}
                {reunionInfo && (reunionInfo.estado === "PENDIENTE" || reunionInfo.estado === "CONFIRMADA") ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-emerald-200 text-sm space-y-1">
                      <div className="font-semibold">Reunión agendada</div>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <span>
                          <span className="text-white/50 text-xs">Fecha: </span>
                          {reunionInfo.slot?.fecha}
                        </span>
                        <span>
                          <span className="text-white/50 text-xs">Hora: </span>
                          {reunionInfo.slot?.hora_inicio?.slice(0, 5)} — {reunionInfo.slot?.hora_fin?.slice(0, 5)}
                        </span>
                        <span>
                          <span className="text-white/50 text-xs">Estado: </span>
                          {reunionInfo.estado}
                        </span>
                      </div>
                      {reunionInfo.nota && (
                        <div className="text-emerald-200/70 text-xs">Nota: {reunionInfo.nota}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={cancelarReunionAgendada}
                        disabled={reunionBusy}
                        className="px-4 py-1.5 rounded-full text-xs font-semibold bg-rose-600/70 hover:bg-rose-600 disabled:opacity-50 transition"
                      >
                        {reunionBusy ? "Cancelando..." : "Cancelar reunión"}
                      </button>
                      {reunionMsg && <span className="text-xs text-sky-200">{reunionMsg}</span>}
                    </div>
                  </div>
                ) : reunionVencido ? (
                  <div className="rounded-xl border border-rose-400/20 bg-rose-500/8 p-3 text-rose-200 text-sm">
                    El plazo de 3 días hábiles para agendar la reunión ha vencido. Contacta al analista.
                  </div>
                ) : slotsDisponibles.length === 0 ? (
                  <div className="text-xs text-white/40 italic text-center py-3">
                    {reunionAviso ||
                      (!estudio?.habilitado_candidato_at
                        ? "El estudio aún no ha sido habilitado. Cuando el analista lo active, tendrás 3 días hábiles para agendar."
                        : "El analista no tiene horarios disponibles en este momento. Espera a que registre su disponibilidad.")}
                  </div>
                ) : (
                  <>
                    {/* Selector de fecha */}
                    {(() => {
                      const fechas = [...new Set(slotsDisponibles.map((s) => s.fecha))].sort();
                      const fechaActiva = fechaFiltro || fechas[0];
                      const slotsDeFecha = slotsDisponibles.filter((s) => s.fecha === fechaActiva);
                      return (
                        <div className="space-y-3">
                          {/* Pestañas de fecha */}
                          <div className="flex gap-2 flex-wrap">
                            {fechas.map((f) => (
                              <button
                                key={f}
                                onClick={() => { setFechaFiltro(f); setReunionSlotId(null); }}
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition ${
                                  fechaActiva === f
                                    ? "border-sky-400/60 bg-sky-600/30 text-sky-100"
                                    : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                                }`}
                              >
                                {new Date(f + "T00:00:00").toLocaleDateString("es-CO", { weekday: "short", month: "short", day: "numeric" })}
                              </button>
                            ))}
                          </div>

                          {/* Horarios del día seleccionado */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {slotsDeFecha.map((s) => (
                              <button
                                key={s.id}
                                onClick={() => setReunionSlotId(s.id)}
                                className={`rounded-xl px-3 py-2.5 text-sm border transition text-center ${
                                  reunionSlotId === s.id
                                    ? "border-sky-400/60 bg-sky-600/30 text-sky-100 font-semibold"
                                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                                }`}
                              >
                                <div>{s.hora_inicio?.slice(0, 5)}</div>
                                <div className="text-xs text-white/40">— {s.hora_fin?.slice(0, 5)}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    <div>
                      <label className="block text-xs text-white/50 mb-1">Nota (opcional)</label>
                      <textarea
                        rows={2}
                        value={reunionNota}
                        onChange={(e) => setReunionNota(e.target.value)}
                        placeholder="Algún comentario sobre el horario elegido..."
                        className="w-full rounded-lg border border-white/10 bg-white/10 px-2 py-1.5 text-sm text-white outline-none focus:border-sky-400/50 resize-none"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={agendarReunionSlot}
                        disabled={reunionBusy || !reunionSlotId}
                        className="px-4 py-1.5 rounded-full text-xs font-semibold bg-sky-600/80 hover:bg-sky-600 disabled:opacity-50 transition"
                      >
                        {reunionBusy ? "Agendando..." : "Confirmar reunión"}
                      </button>
                      {reunionMsg && <span className="text-xs text-sky-200">{reunionMsg}</span>}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {!loading && estudio && (visitaVirtual?.exists || false) && (
            <div className="mx-4">
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-emerald-100">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm">Reunión virtual solicitada por el analista</div>
                    <div className="text-xs text-emerald-100/80">
                      Estado: {visitaVirtual?.estado || "NO_INICIADA"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {visitaVirtual?.meeting_url && (
                      <a
                        href={visitaVirtual.meeting_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-full text-xs font-semibold border border-white/30 hover:bg-white/10"
                      >
                        Abrir reunión
                      </a>
                    )}
                    {(visitaVirtual?.estado || "").toUpperCase() === "ACTIVA" && !geoSharing && (
                      <button
                        onClick={startGeoShare}
                        disabled={geoBusy}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-700/80 hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {geoBusy ? "Activando..." : "Compartir ubicación"}
                      </button>
                    )}
                    {geoSharing && (
                      <button
                        onClick={stopGeoShare}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold border border-white/30 hover:bg-white/10"
                      >
                        Detener ubicación
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mensajes */}
          {msg && (
            <div className="mx-4 mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">
              {msg}
            </div>
          )}

          {/* Avisos (PRIORIDAD: CERRADO > EN REVISIÓN > DEVUELTO) */}
          {!loading && estudio && (
            <div className="mx-4 mt-4">
              {isClosed ? (
                <div
                  className={`rounded-xl p-3 text-sm ${
                    (estudio.decision_final || "").toUpperCase() === "APTO"
                      ? "bg-emerald-500/10 border border-emerald-400/25 text-emerald-100"
                      : "bg-rose-500/10 border border-rose-400/25 text-rose-100"
                  }`}
                >
                  Estudio cerrado: <b>{estudio.decision_final || "—"}</b>.
                </div>
              ) : locked ? (
                <div className="rounded-xl border border-blue-400/25 bg-blue-500/10 p-3 text-blue-100">
                  Tu estudio está <b>en revisión</b>. No puedes editar por ahora.
                </div>
              ) : estudio.observacion_analista ? (
                <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-amber-100">
                  El analista devolvió el estudio. Corrige y vuelve a enviar.
                </div>
              ) : null}
            </div>
          )}

          {/* Tabs */}
          <div className="px-4 pt-4">
            <ModulesNav />
          </div>

          {/* Contenido */}
          <div className="p-4 md:p-6">
            <Outlet context={{ studyId: estudio?.id || null, locked }} />
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-white/50">
          © {new Date().getFullYear()} eConfia · Seguridad & verificación
        </div>
      </div>

      {/* Wizard de consentimientos */}
      {showConsent && estudio?.id && (
        <ConsentWizard
          show={showConsent}
          studyId={estudio.id}
            onDone={async () => {
              setShowConsent(false);
              await load();
            }}
          onCancel={() => setShowConsent(false)}
        />
      )}

      {/* ⬇️ NUEVO: Modal de evaluación (tiene prioridad sobre el de cierre) */}
      {showEval && estudio?.id && (
        <EvaluacionTratoModal
          open={showEval}
          estudioId={estudio.id}
          onClose={() => setShowEval(false)}
          onSubmitted={async () => {
            setShowEval(false);
            try { await api.post("/api/auth/logout/"); } catch {}
            navigate("/login");
          }}
        />
      )}

      {/* Modal de consentimiento de geolocalización */}
      {showGeoConsent && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="max-w-sm w-full rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-5 text-white shadow-2xl">
            <h3 className="text-base font-semibold mb-2">Compartir ubicación</h3>
            <p className="text-sm text-white/80 mb-4">
              ¿Aceptas compartir tu ubicación durante esta reunión virtual para verificación de seguridad?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowGeoConsent(false)}
                className="px-3 py-1.5 rounded-full text-sm border border-white/20 hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                onClick={confirmGeoConsent}
                className="px-3 py-1.5 rounded-full text-sm font-semibold bg-emerald-600/80 hover:bg-emerald-600"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de cierre + redirección al login (solo si NO hay evaluación pendiente) */}
      {!showEval && showClosed && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="max-w-md w-full rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-5 text-white shadow-2xl">
            <h3 className="text-lg font-semibold">Estudio cerrado</h3>
            <p className="mt-2 text-sm text-white/80">
              Su estudio ha sido cerrado por el analista. ¡Gracias por su participación!
            </p>
            <p className="mt-2 text-xs text-white/60">Serás redirigido al inicio de sesión…</p>
            <div className="mt-4 text-right">
              <button
                onClick={async () => {
                  try { await api.post("/api/auth/logout/"); } catch {}
                  navigate("/login");
                }}
                className={
                  `px-3 py-1.5 rounded-full text-sm font-semibold transition
                  bg-slate-700 text-white/90
                  border-2
                  border-slate-600 hover:border-violet-400 hover:shadow-[0_0_10px_2px_rgba(139,92,246,0.3)] hover:text-violet-200`
                }
              >
                Ir al login
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

