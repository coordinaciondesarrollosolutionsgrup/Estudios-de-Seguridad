import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { saveConfigFormulario, getHistorialConfig } from "../api/studies";
import ProgressBarLive from "../components/ProgressBarLive";
import AlertaConsideracionCliente from "../components/AlertaConsideracionCliente";
import useStudyProgress from "../hooks/useStudyProgress";
import ThreeBackground from "../components/ThreeBackground";
import { useToast } from "../components/Toast";

import {
  Building2,
  FileText,
  Download,
  PlusCircle,
  UserRound,
  Mail,
  Phone,
  MapPin,
  IdCard,
} from "lucide-react";

/* ======================= UI helpers ======================= */
const inputCls =
  "rounded-lg border border-white/10 bg-white/10 p-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/30";
const cardCls =
  "rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-2xl";

/* ======================= Small components ======================= */
function LivePct({ studyId, initial = 0 }) {
  const p = useStudyProgress(initial, studyId);
  const val = Number.isFinite(p) ? p : initial || 0;
  return <>{Math.round(val)}%</>;
}

/* ======================= Main ======================= */
export default function ClienteDashboard() {
        const [showHistorialModal, setShowHistorialModal] = useState(false);
        const [historialData, setHistorialData] = useState([]);
        const [loadingHistorial, setLoadingHistorial] = useState(false);
      // Estado para la configuración guardada
      const [configGuardada, setConfigGuardada] = useState({});

    const openHistorialModal = useCallback(async () => {
      setShowHistorialModal(true);
      setLoadingHistorial(true);
      try {
        const { data } = await getHistorialConfig();
        setHistorialData(Array.isArray(data) ? data : []);
      } catch {
        setHistorialData([]);
      } finally {
        setLoadingHistorial(false);
      }
    }, []);

    // Sincronizar configuración guardada al abrir el modal
    const syncConfigFormulario = useCallback(async () => {
      try {
        const { data } = await api.get("/api/config-formulario/");
        // Agrupar por item los subitems excluidos
        const agrupado = {};
        itemTipos.forEach(it => { agrupado[it.key] = []; });
        (Array.isArray(data) ? data : []).forEach(cfg => {
          if (cfg.excluido && agrupado[cfg.item]) {
            agrupado[cfg.item].push(cfg.subitem);
          }
        });
        setExcludedSubitems(agrupado);
        setConfigGuardada(agrupado); // Guardar la config actual para comparar cambios
      } catch (e) {
        // Si falla, mantener el estado actual
      }
    }, []);
  const toast = useToast();

  const [me, setMe] = useState(null);
  const [hasEmpresa, setHasEmpresa] = useState(false);
  const [loadingMe, setLoadingMe] = useState(true);

  const [estudios, setEstudios] = useState([]);
  const [paginaActual, setPaginaActual] = useState(1);
  const [sel, setSel] = useState(null);
  const [msg, setMsg] = useState("");
  const [creando, setCreando] = useState(false);

  const [generating, setGenerating] = useState(false);

  const [form, setForm] = useState({
    nombre: "",
    apellido: "",
    cedula: "",
    email: "",
    celular: "",
    ciudad_residencia: "",
  });

  const [showConfigModal, setShowConfigModal] = useState(false);

  // Estado para el modal de políticas
  const [showPoliticasModal, setShowPoliticasModal] = useState(false);
  const [politicas, setPoliticas] = useState([]);
  const [loadingPoliticas, setLoadingPoliticas] = useState(false);
  const [savingPoliticas, setSavingPoliticas] = useState(false);
  const [politicaEdit, setPoliticaEdit] = useState({});
  const [politicasBloqueadas, setPoliticasBloqueadas] = useState(false);

  // Progreso en vivo para el resumen
  const resumenStudyId = sel?.estudio_id ?? sel?.id ?? null;
  useStudyProgress(sel?.progreso || 0, resumenStudyId);

  /* ---------- API: cargar resumen de un estudio ---------- */
  const openResumen = useCallback(async (id, signal) => {
    const { data } = await api.get(`/api/estudios/${id}/resumen/`, { signal });
    setSel(data);
  }, []);

  /* ---------- API: cargar lista de estudios ---------- */
  const load = useCallback(
    async (signal) => {
      const { data } = await api.get("/api/estudios/", { signal });
      const list = Array.isArray(data) ? data : [];
      setEstudios(list);
      if (list.length) await openResumen(list[0].id, signal);
      else setSel(null);
    },
    [openResumen]
  );

  /* ---------- Cargar usuario / permisos al montar ---------- */
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const { data } = await api.get("/api/auth/me/", { signal: ac.signal });
        setMe(data);

        const _hasEmpresa = Boolean(
          data?.empresa_id != null ? data.empresa_id : data?.empresa
        );
        setHasEmpresa(_hasEmpresa);

        if (data.rol !== "CLIENTE") {
          setMsg("Debes ingresar como CLIENTE para crear solicitudes.");
          return;
        }
        if (!_hasEmpresa) {
          setMsg(
            "Tu usuario CLIENTE no tiene empresa asociada. Pide al admin asignarte una empresa."
          );
          return;
        }

        setMsg("");
        await load(ac.signal);
      } catch (e) {
        if (e.name !== "CanceledError" && e.name !== "AbortError") {
          console.error(e);
          setMsg("No autenticado. Inicia sesión nuevamente.");
        }
      } finally {
        setLoadingMe(false);
      }
    })();
    return () => ac.abort();
  }, [load]);

  /* ---------- Crear solicitud ---------- */
  const disabledCreate = loadingMe || !me || me.rol !== "CLIENTE" || !hasEmpresa;

  const crearSolicitud = useCallback(
    async (e) => {
      e.preventDefault();
      setMsg("");

      if (disabledCreate || creando) return;

      const payload = {
        candidato: {
          nombre: (form.nombre || "").trim(),
          apellido: (form.apellido || "").trim(),
          cedula: (form.cedula || "").trim(),
          email: (form.email || "").trim(),
          celular: (form.celular || "").trim(),
          ciudad_residencia: (form.ciudad_residencia || "").trim(),
        },
      };

      if (!payload.candidato.nombre) return setMsg("Falta el nombre del candidato.");
      if (!payload.candidato.apellido) return setMsg("Faltan los apellidos del candidato.");
      if (!payload.candidato.cedula) return setMsg("Falta la cédula del candidato.");
      if (!payload.candidato.email) return setMsg("Falta el correo del candidato.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.candidato.email))
        return setMsg("El correo del candidato no es válido.");

      // --- VERIFICACIÓN DE CÉDULA Y EMPRESA ---
      try {
        const { data: estudiosExist } = await api.get(`/api/estudios/?cedula=${payload.candidato.cedula}`);
        let existeMismaEmpresa = false;
        let empresasOtras = [];
        if (Array.isArray(estudiosExist)) {
          estudiosExist.forEach(est => {
            let empresaEst = est.empresa || est.empresa_nombre || est.solicitud?.empresa || est.solicitud?.empresa_nombre || "";
            let empresaActual = me?.empresa_nombre || me?.empresa || "";
            if (empresaEst && typeof empresaEst === 'object') empresaEst = empresaEst.nombre || empresaEst.id || JSON.stringify(empresaEst);
            if (empresaActual && typeof empresaActual === 'object') empresaActual = empresaActual.nombre || empresaActual.id || JSON.stringify(empresaActual);
            empresaEst = String(empresaEst).toLowerCase().trim();
            empresaActual = String(empresaActual).toLowerCase().trim();
            if (empresaEst && empresaEst === empresaActual) {
              existeMismaEmpresa = true;
            } else if (empresaEst) {
              empresasOtras.push(empresaEst);
            }
          });
        }
        if (existeMismaEmpresa) {
          return setMsg("Ya existe un estudio para esta cédula en esta empresa. No se puede crear otro.");
        }
        if (empresasOtras.length > 0) {
          toast.info(`Atención: Ya existe(n) estudio(s) con esta cédula en otra(s) empresa(s): ${empresasOtras.join(", ")}`);
        }
      } catch {
        toast.info("No se pudo verificar si la cédula ya existe en otros estudios. Continúa bajo tu responsabilidad.");
      }

      // --- CREACIÓN ---
      setCreando(true);
      const tid = toast.loading("Creando solicitud y enviando correos…");
      try {
        await api.post("/api/solicitudes/", payload);
        toast.update(tid, "success", "✓ Solicitud creada. Se enviaron los correos.");
        setMsg("");
        setForm({
          nombre: "",
          apellido: "",
          cedula: "",
          email: "",
          celular: "",
          ciudad_residencia: "",
        });
        const ac = new AbortController();
        await load(ac.signal);
      } catch (err) {
        const d = err.response?.data;
        let candDetails = null;
        if (d?.candidato && typeof d.candidato === "object") {
          candDetails = Object.entries(d.candidato)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
            .join(" | ");
        }
        const detail =
          d?.detail ||
          d?.non_field_errors?.[0] ||
          d?.empresa?.[0] ||
          candDetails ||
          JSON.stringify(d || {});
        console.error("Error crear solicitud:", d);
        toast.update(tid, "error", `No se pudo crear la solicitud: ${detail}`);
        setMsg(`No se pudo crear la solicitud: ${detail}`);
      } finally {
        setCreando(false);
      }
    },
    [creando, disabledCreate, form, load, me, toast]
  );

  /* ======================= Descargar PDF generado en el backend ======================= */
  const descargarPDFServidor = useCallback(
    async (id) => {
      if (generating) return;
      setGenerating(true);
      try {
        const res = await api.get(`/api/estudios/${id}/pdf/`, {
          responseType: "blob",
        });

        // nombre sugerido (si viene del header)
        const cd = res.headers?.["content-disposition"] || "";
        const m = /filename="?([^"]+)"?/i.exec(cd);
        const suggested = m?.[1] || `Estudio_${id}.pdf`;

        const blob = new Blob([res.data], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = suggested;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error("Fallo al descargar PDF:", e);
        const status = e?.response?.status;
        if (status === 404) {
          toast.error("El PDF no existe: revisa la ruta / permisos o el ID del estudio.");
        } else if (status === 403) {
          toast.error("No tienes permiso para descargar este PDF.");
        } else {
          toast.error("No se pudo generar/descargar el PDF. Revisa el backend.");
        }
      } finally {
        setGenerating(false);
      }
    },
    [generating]
  );

  /* ---------- Derivados ---------- */
  const empresaNombre = useMemo(
    () => me?.empresa_nombre ?? me?.empresa ?? "—",
    [me]
  );

  // Estados para modal de configuración avanzada
  const [selectedItem, setSelectedItem] = useState(null);
  // Inicializa excludedSubitems con arrays vacíos para todos los itemTipos
  const initialExcluded = {};
  itemTipos.forEach(it => { initialExcluded[it.key] = []; });
  const [excludedSubitems, setExcludedSubitems] = useState(initialExcluded); // {itemKey: [subitemKey, ...]}
  const [savingConfig, setSavingConfig] = useState(false);

  // Ejemplo de subitems (puedes expandir según tu modelo)
  const subitems = {
    BIOGRAFICOS: [
      { key: "nombre", label: "Nombre" },
      { key: "apellido", label: "Apellido" },
      { key: "cedula", label: "Cédula" },
      { key: "tipo_documento", label: "Tipo de documento" },
      { key: "fecha_expedicion", label: "Fecha de expedición" },
      { key: "lugar_expedicion", label: "Lugar de expedición" },
      { key: "libreta_militar_numero", label: "Libreta militar - Número" },
      { key: "libreta_militar_clase", label: "Libreta militar - Clase" },
      { key: "libreta_militar_distrito", label: "Libreta militar - Distrito" },
      { key: "licencia_transito_numero", label: "Licencia de tránsito - Número" },
      { key: "licencia_transito_categoria", label: "Licencia de tránsito - Categoría" },
      { key: "licencia_transito_vence", label: "Licencia de tránsito - Vence" },
      { key: "fecha_nacimiento", label: "Fecha de nacimiento" },
      { key: "estatura_cm", label: "Estatura (cm)" },
      { key: "grupo_sanguineo", label: "Grupo sanguíneo" },
      { key: "sexo", label: "Sexo" },
      { key: "estado_civil", label: "Estado civil" },
      { key: "nacionalidad", label: "Nacionalidad" },
      { key: "discapacidad", label: "Discapacidad" },
      { key: "idiomas", label: "Idiomas" },
      { key: "estado_migratorio", label: "Estado migratorio" },
      { key: "direccion", label: "Dirección" },
      { key: "barrio", label: "Barrio" },
      { key: "departamento_id", label: "Departamento (ID)" },
      { key: "departamento_nombre", label: "Departamento (Nombre)" },
      { key: "municipio_id", label: "Municipio (ID)" },
      { key: "municipio_nombre", label: "Municipio (Nombre)" },
      { key: "comuna", label: "Comuna" },
      { key: "estrato", label: "Estrato" },
      { key: "tipo_zona", label: "Tipo de zona" },
      { key: "telefono", label: "Teléfono" },
      { key: "celular", label: "Celular" },
      { key: "eps", label: "EPS" },
      { key: "caja_compensacion", label: "Caja de compensación" },
      { key: "pension_fondo", label: "Fondo de pensión" },
      { key: "cesantias_fondo", label: "Fondo de cesantías" },
      { key: "sisben", label: "Sisbén" },
      { key: "puntaje_sisben", label: "Puntaje Sisbén" },
      { key: "perfil_aspirante", label: "Perfil aspirante" },
      { key: "redes_sociales", label: "Redes sociales" },
      { key: "estudia_actualmente", label: "¿Estudia actualmente?" },
    ],
    INFO_FAMILIAR: [
      { key: "estado_civil", label: "Estado civil" },
      { key: "nombre_pareja", label: "Nombre pareja" },
      { key: "ocupacion_pareja", label: "Ocupación pareja" },
      { key: "empresa_pareja", label: "Empresa pareja" },
      { key: "observaciones", label: "Observaciones" },
      { key: "parientes", label: "Parientes" },
      { key: "hijos", label: "Hijos" },
      { key: "convivientes", label: "Convivientes" },
    ],
    VIVIENDA: [
      { key: "estado_vivienda", label: "Estado vivienda" },
      { key: "iluminacion", label: "Iluminación" },
      { key: "ventilacion", label: "Ventilación" },
      { key: "aseo", label: "Aseo" },
      { key: "servicios_publicos", label: "Servicios públicos" },
      { key: "condiciones", label: "Condiciones" },
      { key: "tenencia", label: "Tenencia" },
      { key: "tipo_inmueble", label: "Tipo inmueble" },
      { key: "espacios", label: "Espacios" },
      { key: "vias_aproximacion", label: "Vías de aproximación" },
    ],
    ACADEMICO: [
      { key: "nivel", label: "Nivel académico" },
      { key: "institucion", label: "Institución" },
      { key: "titulo", label: "Título" },
      { key: "fecha_inicio", label: "Fecha inicio" },
      { key: "fecha_fin", label: "Fecha fin" },
      { key: "estado", label: "Estado" },
      { key: "observaciones", label: "Observaciones" },
    ],
    LABORAL: [
      { key: "empresa", label: "Empresa" },
      { key: "cargo", label: "Cargo" },
      { key: "fecha_ingreso", label: "Fecha ingreso" },
      { key: "fecha_retiro", label: "Fecha retiro" },
      { key: "salario", label: "Salario" },
      { key: "jefe_inmediato", label: "Jefe inmediato" },
      { key: "referencia_nombre", label: "Referencia nombre" },
      { key: "referencia_telefono", label: "Referencia teléfono" },
      { key: "observaciones", label: "Observaciones" },
    ],
    REFERENCIAS: [
      { key: "nombre", label: "Nombre" },
      { key: "telefono", label: "Teléfono" },
      { key: "ocupacion", label: "Ocupación" },
      { key: "empresa", label: "Empresa" },
      { key: "tiempo_conocerse", label: "Tiempo de conocerse" },
      { key: "concepto_sobre_referenciado", label: "Concepto sobre referenciado" },
      { key: "concepto_analista", label: "Concepto analista" },
    ],
    ECONOMICO: [
      { key: "ingresos", label: "Ingresos" },
      { key: "egresos", label: "Egresos" },
      { key: "deudas", label: "Deudas" },
      { key: "observaciones", label: "Observaciones" },
    ],
    PATRIMONIO: [
      { key: "tipo", label: "Tipo" },
      { key: "valor", label: "Valor" },
      { key: "observaciones", label: "Observaciones" },
    ],
    DOCUMENTOS: [
      { key: "tipo", label: "Tipo de documento" },
      { key: "archivo", label: "Archivo" },
      { key: "creado", label: "Fecha de carga" },
    ],
    ANEXOS_FOTOGRAFICOS: [
      { key: "tipo", label: "Tipo de anexo" },
      { key: "archivo", label: "Archivo" },
      { key: "orden", label: "Orden" },
      { key: "creado", label: "Fecha de carga" },
    ],
    LISTAS_RESTRICTIVAS: [
      { key: "tipo", label: "Tipo de lista" },
      { key: "resultado", label: "Resultado" },
      { key: "observaciones", label: "Observaciones" },
    ],
  };

  // Al hacer clic en un ítem, mostrar sus subítems
  const handleItemClick = (itemKey) => setSelectedItem(itemKey);

  // Al marcar/desmarcar subítem como excluido
  const handleSubitemToggle = (itemKey, subitemKey) => {
    setExcludedSubitems((prev) => {
      const current = prev[itemKey] || [];
      return {
        ...prev,
        [itemKey]: current.includes(subitemKey)
          ? current.filter((k) => k !== subitemKey)
          : [...current, subitemKey],
      };
    });
  };

  // Guardar configuración avanzada
  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      // El backend espera un array de objetos: {item, subitem, excluido}
      // Si espera un dict, ajustar aquí
      // Siempre incluir el campo empresa con el ID del usuario
      const empresaId = me?.empresa_id || me?.empresa;
      // Solo enviar los subítems modificados
      const cambios = [];
      Object.entries(excludedSubitems).forEach(([item, subs]) => {
        const prevSubs = configGuardada[item] || [];
        // Nuevos excluidos
        subs.forEach(sub => {
          if (!prevSubs.includes(sub)) {
            cambios.push({ empresa: empresaId, item, subitem: sub, excluido: true });
          }
        });
        // Eliminados (ya no excluidos)
        prevSubs.forEach(sub => {
          if (!subs.includes(sub)) {
            cambios.push({ empresa: empresaId, item, subitem: sub, excluido: false });
          }
        });
      });
      if (cambios.length === 0) {
        toast.info("No hay cambios para guardar.");
        setSavingConfig(false);
        return;
      }
      await saveConfigFormulario(cambios);
      toast.success("✓ Configuración guardada correctamente.");
      setShowConfigModal(false);
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || "Error al guardar configuración.";
      toast.error(detail);
    } finally {
      setSavingConfig(false);
    }
  };

  // Cargar políticas al abrir el modal
  const syncPoliticas = useCallback(async () => {
    setLoadingPoliticas(true);
    try {
      const { data } = await api.get("/api/politicas/?empresa=" + me?.empresa_id);
      setPoliticas(Array.isArray(data) ? data : []);
      // Mapear a objeto editable
      const editObj = {};
      let bloqueada = false;
      (Array.isArray(data) ? data : []).forEach(p => {
        editObj[p.criterio + "__" + p.opcion] = { ...p };
        if (p.bloqueado) bloqueada = true;
      });
      setPoliticaEdit(editObj);
      setPoliticasBloqueadas(bloqueada);
    } catch (e) {}
    setLoadingPoliticas(false);
  }, [me]);

  // Abrir modal de políticas
  const openPoliticasModal = () => {
    syncPoliticas();
    setShowPoliticasModal(true);
  };

  // Guardar cambios de políticas
  const savePoliticas = async () => {
    setSavingPoliticas(true);
    try {
      const cambios = Object.entries(politicaEdit).filter(([, p]) => p._changed);
      for (const [key, pol] of cambios) {
        const [criterio, opcion] = key.split('__');
        // eslint-disable-next-line no-unused-vars
        const { _changed, ...base } = pol;
        if (pol.id) {
          await api.patch(`/api/politicas/${pol.id}/`, { no_relevante: base.no_relevante });
        } else {
          await api.post('/api/politicas/', {
            empresa: me?.empresa_id,
            criterio,
            opcion,
            no_relevante: base.no_relevante ?? true,
          });
        }
      }
      setShowPoliticasModal(false);
      syncPoliticas();
    } catch (e) {
      const detail = e?.response?.data ? JSON.stringify(e.response.data) : e?.message;
      toast.error('Error al guardar políticas: ' + detail);
    }
    setSavingPoliticas(false);
  };

  // Cambiar estado de política
  const handlePoliticaToggle = (key, field) => {
    setPoliticaEdit(edit => {
      const pol = { ...(edit[key] || {}), [field]: !edit[key]?.[field], _changed: true };
      return { ...edit, [key]: pol };
    });
  };

  // ======================= Helpers de políticas =======================
  // Verifica si una política está bloqueada/no relevante
  const isPoliticaBloqueada = (criterio, opcion) => {
    const pol = politicaEdit[criterio + "__" + opcion];
    return pol?.bloqueado;
  };
  const isPoliticaNoRelevante = (criterio, opcion) => {
    const pol = politicaEdit[criterio + "__" + opcion];
    return pol?.no_relevante;
  };

  /* ======================= Render ======================= */
  return (
    <div className="relative min-h-screen text-white">
      {/* Fondo */}
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(1200px_700px_at_25%_20%,rgba(255,255,255,0.06),transparent_60%),linear-gradient(180deg,#0b1220_0%,#0a0f1a_100%)]" />
      <ThreeBackground className="fixed inset-0 -z-10 opacity-40 pointer-events-none" />

      <div className="mx-auto max-w-6xl p-6 space-y-6">
        {/* Header */}
        <div className={`${cardCls} p-5`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-6 w-6 text-white/80" />
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight">Portal del cliente</h1>
                <p className="text-sm text-white/60">Crea solicitudes y revisa el estado de tus estudios.</p>
              </div>
            </div>
            {me && (
              <div className="text-xs text-white/80">
                Usuario: <b>{me.username}</b> · Rol: <b>{me.rol}</b> · Empresa: <b>{empresaNombre}</b>
              </div>
            )}
          </div>
        </div>

        {/* Mensaje global */}
        {msg && (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
            {msg}
          </div>
        )}

        {/* Nueva solicitud */}
        <form onSubmit={crearSolicitud} autoComplete="off" className={`${cardCls} p-5 space-y-4`}>
          <div className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-white/80" />
            <h2 className="text-lg font-semibold">Nueva solicitud</h2>
            <div className="ml-auto flex gap-2">
              <div className="p-[1.5px] rounded-lg bg-gradient-to-r from-transparent via-emerald-500/80 to-transparent">
                <button
                  type="button"
                  onClick={() => {
                    syncConfigFormulario();
                    setShowConfigModal(true);
                  }}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-white bg-slate-700 border-2 border-slate-600 hover:border-emerald-500 hover:shadow-[0_0_10px_2px_rgba(16,185,129,0.4)] transition"
                >
                  Arma tu estudio
                </button>
              </div>
              <div className="p-[1.5px] rounded-lg bg-gradient-to-r from-transparent via-blue-500/80 to-transparent">
                <button
                  type="button"
                  onClick={openHistorialModal}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-white bg-slate-700 border-2 border-slate-600 hover:border-blue-500 hover:shadow-[0_0_10px_2px_rgba(59,130,246,0.4)] transition"
                  style={{marginLeft:0}}
                >
                  Historial de configuraciones
                </button>
              </div>
            </div>
          </div>
       {/* Modal de historial de configuraciones */}
      {showHistorialModal && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.5)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={() => setShowHistorialModal(false)}>
          <div style={{background:'rgba(24,24,27,0.95)',borderRadius:16,maxWidth:500,width:'90vw',maxHeight:'80vh',overflowY:'auto',padding:24,position:'relative',color:'#fff',boxShadow:'0 8px 32px 0 rgba(0,0,0,0.37)',border:'1px solid rgba(255,255,255,0.08)',zIndex:2010}} onClick={e => e.stopPropagation()}>
            <button style={{position:'absolute',top:12,right:12,background:'#333',color:'#fff',border:'none',borderRadius:'50%',width:32,height:32,fontSize:20,cursor:'pointer',zIndex:2020}} onClick={() => setShowHistorialModal(false)}>×</button>
            <h2 style={{marginBottom:16}}>Historial de configuraciones</h2>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',fontSize:14,background:'rgba(0,0,0,0.1)',borderRadius:8}}>
                <thead>
                  <tr style={{background:'#222'}}>
                    <th style={{padding:'8px',textAlign:'left'}}>Fecha</th>
                    <th style={{padding:'8px',textAlign:'left'}}>Usuario</th>
                    <th style={{padding:'8px',textAlign:'left'}}>Acción</th>
                    <th style={{padding:'8px',textAlign:'left'}}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Ejemplo de datos, reemplazar por datos reales luego */}
                  <tr style={{background:'rgba(255,255,255,0.02)'}}>
                    <td style={{padding:'8px'}}>2026-03-27 09:20</td>
                    <td style={{padding:'8px'}}>cliente1</td>
                    <td style={{padding:'8px'}}>Excluyó subítem</td>
                    <td style={{padding:'8px'}}>BIOGRAFICOS: fecha de nacimiento</td>
                  </tr>
                  <tr style={{background:'rgba(255,255,255,0.04)'}}>
                    <td style={{padding:'8px'}}>2026-03-26 16:10</td>
                    <td style={{padding:'8px'}}>cliente1</td>
                    <td style={{padding:'8px'}}>Incluyó subítem</td>
                    <td style={{padding:'8px'}}>LABORAL: empresa</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-white/60" />
              <input
                className={`${inputCls} flex-1`}
                placeholder="Nombres"
                value={form.nombre}
                onChange={(e) => setForm((s) => ({ ...s, nombre: e.target.value }))}
              />
            </div>
            <input
              className={inputCls}
              placeholder="Apellidos"
              value={form.apellido}
              onChange={(e) => setForm((s) => ({ ...s, apellido: e.target.value }))}
            />
            <div className="flex items-center gap-2">
              <IdCard className="h-4 w-4 text-white/60" />
              <input
                className={`${inputCls} flex-1`}
                placeholder="Cédula"
                value={form.cedula}
                onChange={(e) => setForm((s) => ({ ...s, cedula: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-white/60" />
              <input
                className={`${inputCls} flex-1`}
                placeholder="Correo"
                value={form.email}
                onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-white/60" />
              <input
                className={`${inputCls} flex-1`}
                placeholder="Celular"
                value={form.celular}
                onChange={(e) => setForm((s) => ({ ...s, celular: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-white/60" />
              <input
                className={`${inputCls} flex-1`}
                placeholder="Ciudad de residencia"
                value={form.ciudad_residencia}
                onChange={(e) => setForm((s) => ({ ...s, ciudad_residencia: e.target.value }))}
              />
            </div>
          </div>

          <div className="pt-1 flex items-center gap-2">
            <div className="flex gap-2">
              <div className="p-[1.5px] rounded-lg bg-gradient-to-r from-transparent via-blue-500/80 to-transparent">
                <button
                  type="submit"
                  disabled={disabledCreate || creando}
                  className={`rounded-xl px-4 py-2 text-sm font-medium text-white bg-slate-700 border-2 border-slate-600 transition flex items-center gap-2 ${
                    disabledCreate || creando ? "cursor-not-allowed opacity-60" : "hover:border-blue-500 hover:shadow-[0_0_10px_2px_rgba(59,130,246,0.4)]"
                  }`}
                >
                  {creando && (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                    </svg>
                  )}
                  {creando ? "Creando…" : "Crear solicitud"}
                </button>
              </div>
              <div className="p-[1.5px] rounded-lg bg-gradient-to-r from-transparent via-amber-500/80 to-transparent">
                <button
                  type="button"
                  onClick={openPoliticasModal}
                  className={`rounded-xl px-4 py-2 text-sm font-medium text-white bg-slate-700 border-2 border-slate-600 transition ${politicasBloqueadas ? 'opacity-50 cursor-not-allowed' : 'hover:border-amber-500 hover:shadow-[0_0_10px_2px_rgba(245,158,11,0.4)]'}`}
                  disabled={politicasBloqueadas}
                  title={politicasBloqueadas ? 'La configuración de políticas está bloqueada. Contacta al administrador para editar.' : ''}
                  style={{marginLeft:0}}
                >
                  Configurar políticas
                </button>
              </div>
            </div>
            {politicasBloqueadas && (
              <div className="ml-2 text-xs text-red-300">La configuración de políticas está bloqueada. Contacta al administrador para editar.</div>
            )}
          </div>
        </form>

        {/* Modal de historial de configuraciones */}
        {showHistorialModal && (
          <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={() => setShowHistorialModal(false)}>
            <div style={{background:'rgba(24,24,27,0.95)',borderRadius:16,maxWidth:580,width:'90vw',maxHeight:'80vh',overflowY:'auto',padding:24,position:'relative',color:'#fff',boxShadow:'0 8px 32px 0 rgba(0,0,0,0.37)',border:'1px solid rgba(255,255,255,0.08)'}} onClick={e => e.stopPropagation()}>
              <button style={{position:'absolute',top:12,right:12,background:'#333',color:'#fff',border:'none',borderRadius:'50%',width:32,height:32,fontSize:20,cursor:'pointer',zIndex:10}} onClick={() => setShowHistorialModal(false)}>×</button>
              <h2 style={{marginBottom:6,fontSize:18,fontWeight:'bold'}}>Historial de configuraciones</h2>
              <p style={{fontSize:12,color:'#d1d5db',marginBottom:16}}>
                Registro de cambios realizados sobre los ítems y subítems del formulario de estudio.
              </p>
              {loadingHistorial ? (
                <div style={{textAlign:'center',padding:'24px 0',color:'#9ca3af',fontSize:13}}>Cargando historial...</div>
              ) : historialData.length === 0 ? (
                <div style={{textAlign:'center',padding:'24px 0',color:'#9ca3af',fontSize:13}}>No hay cambios registrados aún.</div>
              ) : (
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',fontSize:13,borderCollapse:'collapse'}}>
                    <thead>
                      <tr style={{background:'#222',color:'#d1d5db',textTransform:'uppercase',fontSize:11,letterSpacing:'0.05em'}}>
                        <th style={{padding:'8px 10px',textAlign:'left',fontWeight:600,borderBottom:'1px solid rgba(255,255,255,0.08)'}}>Fecha</th>
                        <th style={{padding:'8px 10px',textAlign:'left',fontWeight:600,borderBottom:'1px solid rgba(255,255,255,0.08)'}}>Usuario</th>
                        <th style={{padding:'8px 10px',textAlign:'left',fontWeight:600,borderBottom:'1px solid rgba(255,255,255,0.08)'}}>Acción</th>
                        <th style={{padding:'8px 10px',textAlign:'left',fontWeight:600,borderBottom:'1px solid rgba(255,255,255,0.08)'}}>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historialData.map((h, i) => {
                        const esExclusion = h.accion.toLowerCase().includes('excluy') || h.accion.toLowerCase().includes('no relevante');
                        const fecha = new Date(h.fecha).toLocaleString('es-CO', {dateStyle:'short', timeStyle:'short'});
                        return (
                          <tr key={h.id} style={{background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)', borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                            <td style={{padding:'9px 10px',color:'#9ca3af',whiteSpace:'nowrap'}}>{fecha}</td>
                            <td style={{padding:'9px 10px',color:'#e5e7eb'}}>{h.usuario_nombre}</td>
                            <td style={{padding:'9px 10px'}}>
                              <span style={{
                                background: esExclusion ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                                color: esExclusion ? '#f87171' : '#34d399',
                                padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:'bold',
                                border: esExclusion ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(16,185,129,0.25)',
                                whiteSpace:'nowrap'
                              }}>{h.accion}</span>
                            </td>
                            <td style={{padding:'9px 10px',color:'#d1d5db'}}>
                              <span style={{color:'#f59e42',fontWeight:'bold'}}>{h.item}</span>: {h.subitem}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal de configuración avanzada "Arma tu estudio" */}
        {showConfigModal && (
          <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={() => setShowConfigModal(false)}>
            <div style={{background:'rgba(24,24,27,0.95)',borderRadius:16,maxWidth:500,width:'90vw',maxHeight:'80vh',overflowY:'auto',padding:24,position:'relative',color:'#fff',boxShadow:'0 8px 32px 0 rgba(0,0,0,0.37)',border:'1px solid rgba(255,255,255,0.08)'}} onClick={e => e.stopPropagation()}>
              <button style={{position:'absolute',top:12,right:12,background:'#333',color:'#fff',border:'none',borderRadius:'50%',width:32,height:32,fontSize:20,cursor:'pointer',zIndex:10}} onClick={() => setShowConfigModal(false)}>×</button>
              <h2 style={{marginBottom:16}}>Arma tu estudio</h2>
              <p style={{fontSize:12,color:'#d1d5db',marginBottom:12}}>
                Arma tu estudio a tu gusto. Selecciona un ítem y selecciona los subítems que <b style={{color:'#f59e42'}}>NO</b> deseas que aparezcan en tu formulario.
              </p>
              <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:16}}>
                {itemTipos.map((it) => (
                  <button
                    key={it.key}
                    onClick={() => handleItemClick(it.key)}
                    className={`w-[48%] text-left px-3 py-1.5 rounded-full text-sm font-semibold transition
                      bg-slate-700
                      border-2
                      ${selectedItem === it.key
                        ? "border-violet-500 shadow-[0_0_10px_2px_rgba(139,92,246,0.4)] bg-slate-800 text-violet-200"
                        : "border-slate-600 text-white/90 hover:border-violet-400 hover:shadow-[0_0_10px_2px_rgba(139,92,246,0.3)] hover:text-violet-200"}
                    `}
                    style={{marginBottom: 8, fontWeight: selectedItem === it.key ? 'bold' : 'normal'}}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
              {selectedItem && (
                <div style={{marginBottom:16}}>
                  <h3 style={{fontWeight:'bold',marginBottom:8}}>Subítems de {itemTipos.find(i => i.key === selectedItem)?.label}</h3>
                  {subitems[selectedItem]?.map((sub) => (
                    <label key={sub.key} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,width:'48%'}}>
                      <input
                        type="checkbox"
                        checked={Array.isArray(excludedSubitems[selectedItem]) ? excludedSubitems[selectedItem].includes(sub.key) : false}
                        onChange={() => handleSubitemToggle(selectedItem, sub.key)}
                        style={{accentColor:'#f59e42'}}
                      />
                      <span style={{color:excludedSubitems[selectedItem]?.includes(sub.key)?'#f59e42':'#fff',fontWeight:excludedSubitems[selectedItem]?.includes(sub.key)?'bold':'normal'}}>
                        {sub.label} {excludedSubitems[selectedItem]?.includes(sub.key) && "NO"}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <button
                onClick={saveConfig}
                disabled={savingConfig}
                style={{marginTop:16,background:'#10b981',color:'#fff',padding:'8px 16px',borderRadius:6,border:'none',fontWeight:'bold',fontSize:14,cursor:savingConfig?'not-allowed':'pointer'}}
              >
                Guardar configuración
              </button>
            </div>
          </div>
        )}

        {/* Modal de configuración de políticas personalizado */}
        {showPoliticasModal && (
          <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={() => setShowPoliticasModal(false)}>
            <div style={{background:'rgba(24,24,27,0.95)',borderRadius:16,maxWidth:500,width:'90vw',maxHeight:'80vh',overflowY:'auto',padding:24,position:'relative',color:'#fff',boxShadow:'0 8px 32px 0 rgba(0,0,0,0.37)',border:'1px solid rgba(255,255,255,0.08)'}} onClick={e => e.stopPropagation()}>
              <button style={{position:'absolute',top:12,right:12,background:'#333',color:'#fff',border:'none',borderRadius:'50%',width:32,height:32,fontSize:20,cursor:'pointer',zIndex:10}} onClick={() => setShowPoliticasModal(false)}>×</button>
              <h2 className="text-xl font-bold mb-2">Configura tus políticas</h2>
              <p className="text-sm text-white/70 mb-4">
                Los datos seleccionados serán considerados como <b className="text-amber-400">NO RELEVANTES</b> y el estudio será evaluado a consideración del cliente. Una vez guardada la configuración, el formulario quedará <b className="text-amber-400">BLOQUEADO</b> y no podrá ser editado hasta que el <b className="text-amber-400">ADMINISTRADOR</b> lo habilite nuevamente.
              </p>
              {/* Secciones y opciones de políticas */}
              {politicasBloqueadas && (
                <div style={{background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:8,padding:'8px 12px',marginBottom:16,color:'#fca5a5',fontSize:13}}>
                  🔒 La configuración está <b>BLOQUEADA</b>. Solo el <b>ADMINISTRADOR</b> puede habilitarla nuevamente.
                </div>
              )}
              <form onSubmit={e => { e.preventDefault(); savePoliticas(); }}>
                <div style={{marginBottom:16,opacity:politicasBloqueadas?0.5:1}}>
                  <div style={{fontWeight:'bold',marginBottom:8}}>Delitos</div>
                  <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,cursor:politicasBloqueadas?'not-allowed':'pointer'}}>
                    <input type="checkbox" disabled={politicasBloqueadas} checked={!!politicaEdit['delitos__procesos_alimentos']?.no_relevante} onChange={() => handlePoliticaToggle('delitos__procesos_alimentos', 'no_relevante')} style={{accentColor:'#f59e42'}} />
                    <span style={{color:politicaEdit['delitos__procesos_alimentos']?.no_relevante?'#f59e42':'#fff',fontWeight:politicaEdit['delitos__procesos_alimentos']?.no_relevante?'bold':'normal'}}>Procesos de alimentos</span>
                  </label>
                  <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,cursor:politicasBloqueadas?'not-allowed':'pointer'}}>
                    <input type="checkbox" disabled={politicasBloqueadas} checked={!!politicaEdit['delitos__rinas']?.no_relevante} onChange={() => handlePoliticaToggle('delitos__rinas', 'no_relevante')} style={{accentColor:'#f59e42'}} />
                    <span style={{color:politicaEdit['delitos__rinas']?.no_relevante?'#f59e42':'#fff',fontWeight:politicaEdit['delitos__rinas']?.no_relevante?'bold':'normal'}}>Riñas</span>
                  </label>
                </div>
                <div style={{marginBottom:16,opacity:politicasBloqueadas?0.5:1}}>
                  <div style={{fontWeight:'bold',marginBottom:8}}>Lugar de residencia</div>
                  <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,cursor:politicasBloqueadas?'not-allowed':'pointer'}}>
                    <input type="checkbox" disabled={politicasBloqueadas} checked={!!politicaEdit['residencia__zonas_perifericas']?.no_relevante} onChange={() => handlePoliticaToggle('residencia__zonas_perifericas', 'no_relevante')} style={{accentColor:'#f59e42'}} />
                    <span style={{color:politicaEdit['residencia__zonas_perifericas']?.no_relevante?'#f59e42':'#fff',fontWeight:politicaEdit['residencia__zonas_perifericas']?.no_relevante?'bold':'normal'}}>Zonas periféricas</span>
                  </label>
                  <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,cursor:politicasBloqueadas?'not-allowed':'pointer'}}>
                    <input type="checkbox" disabled={politicasBloqueadas} checked={!!politicaEdit['residencia__sur_ciudad']?.no_relevante} onChange={() => handlePoliticaToggle('residencia__sur_ciudad', 'no_relevante')} style={{accentColor:'#f59e42'}} />
                    <span style={{color:politicaEdit['residencia__sur_ciudad']?.no_relevante?'#f59e42':'#fff',fontWeight:politicaEdit['residencia__sur_ciudad']?.no_relevante?'bold':'normal'}}>Sur de la ciudad</span>
                  </label>
                  <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,cursor:politicasBloqueadas?'not-allowed':'pointer'}}>
                    <input type="checkbox" disabled={politicasBloqueadas} checked={!!politicaEdit['residencia__comunas']?.no_relevante} onChange={() => handlePoliticaToggle('residencia__comunas', 'no_relevante')} style={{accentColor:'#f59e42'}} />
                    <span style={{color:politicaEdit['residencia__comunas']?.no_relevante?'#f59e42':'#fff',fontWeight:politicaEdit['residencia__comunas']?.no_relevante?'bold':'normal'}}>Comunas</span>
                  </label>
                </div>
                <div style={{marginBottom:16,opacity:politicasBloqueadas?0.5:1}}>
                  <div style={{fontWeight:'bold',marginBottom:8}}>Tránsito</div>
                  <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,cursor:politicasBloqueadas?'not-allowed':'pointer'}}>
                    <input type="checkbox" disabled={politicasBloqueadas} checked={!!politicaEdit['transito__comparendos']?.no_relevante} onChange={() => handlePoliticaToggle('transito__comparendos', 'no_relevante')} style={{accentColor:'#f59e42'}} />
                    <span style={{color:politicaEdit['transito__comparendos']?.no_relevante?'#f59e42':'#fff',fontWeight:politicaEdit['transito__comparendos']?.no_relevante?'bold':'normal'}}>Comparendos</span>
                  </label>
                </div>
                <div style={{marginBottom:16,opacity:politicasBloqueadas?0.5:1}}>
                  <div style={{fontWeight:'bold',marginBottom:8}}>Centrales de riesgo</div>
                  <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,cursor:politicasBloqueadas?'not-allowed':'pointer'}}>
                    <input type="checkbox" disabled={politicasBloqueadas} checked={!!politicaEdit['centrales__reportes_negativos']?.no_relevante} onChange={() => handlePoliticaToggle('centrales__reportes_negativos', 'no_relevante')} style={{accentColor:'#f59e42'}} />
                    <span style={{color:politicaEdit['centrales__reportes_negativos']?.no_relevante?'#f59e42':'#fff',fontWeight:politicaEdit['centrales__reportes_negativos']?.no_relevante?'bold':'normal'}}>Reportes negativos</span>
                  </label>
                </div>
                <div style={{marginBottom:16,opacity:politicasBloqueadas?0.5:1}}>
                  <div style={{fontWeight:'bold',marginBottom:8}}>Consumo de drogas</div>
                  <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,cursor:politicasBloqueadas?'not-allowed':'pointer'}}>
                    <input type="checkbox" disabled={politicasBloqueadas} checked={!!politicaEdit['drogas__consumo_frecuente']?.no_relevante} onChange={() => handlePoliticaToggle('drogas__consumo_frecuente', 'no_relevante')} style={{accentColor:'#f59e42'}} />
                    <span style={{color:politicaEdit['drogas__consumo_frecuente']?.no_relevante?'#f59e42':'#fff',fontWeight:politicaEdit['drogas__consumo_frecuente']?.no_relevante?'bold':'normal'}}>Consumo frecuente</span>
                  </label>
                  <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,cursor:politicasBloqueadas?'not-allowed':'pointer'}}>
                    <input type="checkbox" disabled={politicasBloqueadas} checked={!!politicaEdit['drogas__consumo_pasado']?.no_relevante} onChange={() => handlePoliticaToggle('drogas__consumo_pasado', 'no_relevante')} style={{accentColor:'#f59e42'}} />
                    <span style={{color:politicaEdit['drogas__consumo_pasado']?.no_relevante?'#f59e42':'#fff',fontWeight:politicaEdit['drogas__consumo_pasado']?.no_relevante?'bold':'normal'}}>Consumo pasado</span>
                  </label>
                </div>
                {/* Campo Otros para cada grupo */}
                <div style={{marginBottom:16,opacity:politicasBloqueadas?0.5:1}}>
                  <div style={{fontWeight:'bold',marginBottom:8}}>Otros</div>
                  <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,cursor:politicasBloqueadas?'not-allowed':'pointer'}}>
                    <input type="checkbox" disabled={politicasBloqueadas} checked={!!politicaEdit['otros__delitos']?.no_relevante} onChange={() => handlePoliticaToggle('otros__delitos', 'no_relevante')} style={{accentColor:'#f59e42'}} />
                    <span style={{color:politicaEdit['otros__delitos']?.no_relevante?'#f59e42':'#fff',fontWeight:politicaEdit['otros__delitos']?.no_relevante?'bold':'normal'}}>Otros (especifique):</span>
                    <input
                      type="text"
                      disabled={politicasBloqueadas || !politicaEdit['otros__delitos']?.no_relevante}
                      value={politicaEdit['otros__delitos']?.texto || ''}
                      onChange={e => setPoliticaEdit(edit => ({
                        ...edit,
                        ['otros__delitos']: {
                          ...(edit['otros__delitos'] || {}),
                          texto: e.target.value,
                          no_relevante: true,
                          _changed: true
                        }
                      }))}
                      placeholder="Escriba aquí..."
                      style={{flex:1,minWidth:120,padding:'2px 6px',borderRadius:4,border:'1px solid #f59e42',background:'#18181b',color:'#fff'}}
                    />
                  </label>
                </div>
                {!politicasBloqueadas && (
                  <button
                    type="submit"
                    disabled={savingPoliticas}
                    style={{marginTop:16,background:'#10b981',color:'#fff',padding:'8px 16px',borderRadius:6,border:'none',fontWeight:'bold',fontSize:14,cursor:savingPoliticas?'not-allowed':'pointer'}}
                  >
                    Guardar políticas
                  </button>
                )}
              </form>
            </div>
          </div>
        )}

        {/* Ejemplo de alerta visual y bloqueo en el formulario según políticas */}
        {Object.values(politicaEdit).some(pol => pol.bloqueado) && (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm text-red-200 my-4">
            Atención: Hay políticas bloqueadas. La edición de ciertos campos está restringida para analistas/candidatos.
          </div>
        )}

        {/* Lista + Resumen */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Lista */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Estudios</h3>
              {estudios.length > 0 && (
                <span className="text-xs text-white/50">
                  {estudios.length} estudio{estudios.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className={`${cardCls} divide-y divide-white/5`}>
              {estudios.length ? (
                estudios.slice((paginaActual - 1) * 8, paginaActual * 8).map((es) => (
                  <button
                    key={es.id}
                    onClick={() => openResumen(es.id)}
                    className="w-full text-left transition hover:bg-white/5"
                  >
                    <div className="flex flex-col gap-1 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-white/70" />
                          <span className="font-medium">Estudio #{es.id}</span>
                        </div>
                        <div className="text-xs text-white/70 flex items-center gap-3">
                          <span>{es.nivel_cualitativo || "—"}</span>
                          <span>
                            <LivePct studyId={es.id} initial={es.progreso || 0} />
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-white/80 pl-6">
                        {es.candidato ? (
                          <>
                            <span className="mr-2">{es.candidato.nombre} {es.candidato.apellido}</span>
                            <span className="text-white/60">Cédula: {es.candidato.cedula}</span>
                          </>
                        ) : (
                          <span className="text-white/50">Sin datos de candidato</span>
                        )}
                      </div>
                    </div>
                    <div className="px-3 pb-3">
                      <ProgressBarLive estudioId={es.id} initial={es.progreso || 0} />
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-4 text-sm text-white/70">Sin estudios.</div>
              )}
            </div>
            {/* Paginación */}
            {estudios.length > 8 && (() => {
              const totalPags = Math.ceil(estudios.length / 8);
              return (
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,paddingTop:4}}>
                  <button
                    onClick={() => setPaginaActual(p => Math.max(1, p - 1))}
                    disabled={paginaActual === 1}
                    style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.1)',color: paginaActual === 1 ? '#4b5563' : '#e5e7eb',borderRadius:8,width:32,height:32,cursor: paginaActual === 1 ? 'not-allowed' : 'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}
                  >‹</button>
                  {Array.from({length: totalPags}, (_, i) => i + 1).map(n => (
                    <button
                      key={n}
                      onClick={() => setPaginaActual(n)}
                      style={{background: paginaActual === n ? '#6366f1' : 'rgba(255,255,255,0.08)',border: paginaActual === n ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',color: paginaActual === n ? '#fff' : '#9ca3af',borderRadius:8,width:32,height:32,cursor:'pointer',fontSize:13,fontWeight: paginaActual === n ? 'bold' : 'normal'}}
                    >{n}</button>
                  ))}
                  <button
                    onClick={() => setPaginaActual(p => Math.min(totalPags, p + 1))}
                    disabled={paginaActual === totalPags}
                    style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.1)',color: paginaActual === totalPags ? '#4b5563' : '#e5e7eb',borderRadius:8,width:32,height:32,cursor: paginaActual === totalPags ? 'not-allowed' : 'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}
                  >›</button>
                </div>
              );
            })()}
          </div>

          {/* Resumen */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Resumen</h3>
            {!sel ? (
              <div className={`${cardCls} p-4`}>Selecciona un estudio</div>
            ) : (
              <div className={`${cardCls} p-4 space-y-3`}>
                {/* Alerta de políticas no relevantes */}
                <AlertaConsideracionCliente
                  politicasNoRelevantes={(() => {
                    if (Array.isArray(sel.politicas_no_relevantes)) {
                      return sel.politicas_no_relevantes.map(p =>
                        typeof p === 'string' ? p : (p.texto || p.nombre || p.label || JSON.stringify(p))
                      );
                    }
                    if (Array.isArray(sel.politicas)) {
                      return sel.politicas.filter(p => p.no_relevante).map(p => {
                        if (p.criterio === 'otros' && p.texto) {
                          return `Otros: ${p.texto}`;
                        }
                        return p.label || p.opcion || p.nombre || JSON.stringify(p);
                      });
                    }
                    return [];
                  })()}
                />
                <div className="flex items-center justify-between">
                  <div className="font-medium">Estudio #{sel.estudio_id}</div>
                  <div className="text-sm text-white/80">
                    Progreso: <LivePct studyId={resumenStudyId} initial={sel.progreso || 0} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <div className="text-white/70">Items</div>
                    <div className="font-semibold">{sel.totales.items}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <div className="text-white/70">Validados</div>
                    <div className="font-semibold">{sel.totales.validados}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <div className="text-white/70">Hallazgos</div>
                    <div className="font-semibold">{sel.totales.hallazgos}</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-1">Secciones</h4>
                  <ul className="text-sm space-y-1">
                    {Object.entries(sel.secciones || {}).map(([sec, info]) => (
                      <li
                        key={sec}
                        className="border border-white/10 bg-white/5 rounded p-2 flex items-center justify-between"
                      >
                        <span className="capitalize">{sec.replaceAll("_", " ").toLowerCase()}</span>
                        <span className="text-white/70">✓ {info.validados} · ⚠️ {info.hallazgos}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => descargarPDFServidor(sel.estudio_id)}
                    disabled={generating}
                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm text-white ${
                      generating ? "bg-slate-600 cursor-wait" : "bg-indigo-600 hover:bg-indigo-500"
                    }`}
                    title={generating ? "Generando…" : "Descargar PDF"}
                  >
                    <Download className="h-4 w-4" />
                    {generating ? "Generando…" : "Descargar PDF"}
                  </button>

                  <span className="text-sm text-white/80">
                    Autorización: {" "}
                    <b className={sel.autorizacion?.firmada ? "text-emerald-300" : "text-amber-300"}>
                      {sel.autorizacion?.firmada ? "Firmada" : "Pendiente"}
                    </b>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Declaración de itemTipos al inicio del componente
const itemTipos = [
  { key: "BIOGRAFICOS", label: "Biográficos" },
  { key: "INFO_FAMILIAR", label: "Info Familiar" },
  { key: "VIVIENDA", label: "Vivienda" },
  { key: "ACADEMICO", label: "Académico" },
  { key: "LABORAL", label: "Laboral" },
  { key: "REFERENCIAS", label: "Referencias" },
  { key: "ECONOMICO", label: "Económica" },
  { key: "PATRIMONIO", label: "Patrimonio" },
  { key: "DOCUMENTOS", label: "Documentos" },
  { key: "ANEXOS_FOTOGRAFICOS", label: "Anexos fotográficos" },
  { key: "LISTAS_RESTRICTIVAS", label: "Listas restrictivas" },
];
