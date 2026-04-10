# ...existing imports...


# apps/studies/views.py
from io import BytesIO
import io
import os
import base64
import urllib.request
from types import SimpleNamespace
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q, Count, Prefetch
from django.http import FileResponse
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.utils.dateparse import parse_date
from datetime import timedelta

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework import viewsets, permissions

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from django.template.loader import render_to_string

try:
    from PIL import Image
except Exception:
    Image = None

# --------------------------------------------------------------------------------------
# Modelos / Serializers
# --------------------------------------------------------------------------------------
from apps.notifications.models import Notificacion
from apps.candidates.serializers import CandidatoBioSerializer

from .models import (
    Solicitud,
    Estudio,
    EstudioItem,
    ItemTipo,
    EstudioConsentimiento,
    ConsentimientoTipo,
    Academico,
    Laboral,
    EstudioDocumento,
    Economica,
    AnexoFoto,
    EvaluacionTrato,
    EstudioReferencia,
    ReferenciaPersonal,
    Patrimonio,
    EstudioVisitaVirtual,
    VisitaVirtualEstado,
    ClienteConfiguracionFormulario,
    ClientePoliticaConfiguracion,
    HistorialConfiguracion,
    DisponibilidadReunionCandidato,
    SlotDisponibilidadAnalista,
    DisponibilidadAnalista,
    DisponibilidadAnalistaEstado,
    ReunionVirtualAgendada,
    calcular_fecha_limite,
)
from .serializers import (
    SolicitudCreateSerializer,
    EstudioSerializer,
    EstudioClienteListSerializer,
    EstudioItemSerializer,
    EstudioConsentimientoSerializer,
    LaboralSerializer,
    AcademicoSerializer,
    EconomicaSerializer,
    AnexoFotoSerializer,
    EvaluacionTratoSerializer,
    EstudioReferenciaSerializer,
    EstudioDetalleSerializer,
    ReferenciaPersonalSerializer,
    PatrimonioSerializer,
    ClienteConfiguracionFormularioSerializer,
    ClientePoliticaConfiguracionSerializer,
    HistorialConfiguracionSerializer,
    DisponibilidadReunionSerializer,
    SlotDisponibilidadAnalistaSerializer,
    DisponibilidadAnalistaSerializer,
    ReunionVirtualAgendadaSerializer,
)

# ======================================================================================
# Helpers
# ======================================================================================




def _map_ref_payload(r):
    """
    Normaliza un item del front a los campos reales:
    nombres, apellidos, telefono, relacion, comentario.
    Acepta alias: nombre/funcionario, phone/celular, familiar/parentesco/cargo, observacion, etc.
    """
    if not isinstance(r, dict):
        return {}

    full = (r.get("nombres") or r.get("nombre") or r.get("funcionario") or "").strip()
    apellidos = (r.get("apellidos") or r.get("last_name") or "").strip()

    if full and not apellidos and " " in full:
        partes = full.split()
        full, apellidos = partes[0], " ".join(partes[1:])

    tel = (r.get("telefono") or r.get("phone") or r.get("celular") or "").strip()
    rel = (r.get("relacion") or r.get("familiar") or r.get("parentesco") or r.get("cargo") or "").strip()
    com = (r.get("comentario") or r.get("observacion") or "").strip()

    out = {"nombres": full, "apellidos": apellidos, "telefono": tel, "relacion": rel, "comentario": com}
    # mÃ­nimo: al menos nombre o telÃ©fono
    if not (out["nombres"] or out["telefono"]):
        return {}
    return out


def _collect_refs_from_request(data):
    """
    Soporta:
      { "referencias": [ ... ] }
      { "laborales": [ ... ], "personales": [ ... ] }
      [ ... ]  (lista directa)
    Devuelve lista normalizada, mÃ¡x 6 (3+3).
    """
    refs = []
    if isinstance(data, list):
        refs = data
    elif isinstance(data, dict):
        if isinstance(data.get("referencias"), list):
            refs = data["referencias"]
        else:
            if isinstance(data.get("laborales"), list):
                refs += data["laborales"]
            if isinstance(data.get("personales"), list):
                refs += data["personales"]

    mapped = []
    for r in refs:
        m = _map_ref_payload(r)
        if m:
            mapped.append(m)
    return mapped[:6]


def _nombre_persona(obj, fallback=""):
    if not obj:
        return fallback
    nombre = getattr(obj, "nombre", None)
    apellido = getattr(obj, "apellido", None)
    if nombre or apellido:
        full = f"{nombre or ''} {apellido or ''}".strip()
        if full:
            return full
    first = getattr(obj, "first_name", None)
    last = getattr(obj, "last_name", None)
    if first or last:
        full = f"{first or ''} {last or ''}".strip()
        if full:
            return full
    return getattr(obj, "username", None) or getattr(obj, "email", None) or fallback


def _frontend_link_por_rol(rol):
    frontend = getattr(settings, "FRONTEND_URL", "http://localhost:5173").rstrip("/")
    return {
        "CANDIDATO": f"{frontend}/candidato",
        "ANALISTA": f"{frontend}/analista",
        "CLIENTE": f"{frontend}/cliente",
    }.get(rol, frontend)


def _primer_slot_disponible_para_estudio(estudio):
    fecha_limite = estudio.fecha_limite_agendamiento()
    analista = getattr(getattr(estudio, "solicitud", None), "analista", None)
    hoy = timezone.localdate()
    if not analista or not fecha_limite or hoy > fecha_limite:
        return None
    return (
        DisponibilidadAnalista.objects.filter(
            analista=analista,
            estado=DisponibilidadAnalistaEstado.DISPONIBLE,
            fecha__gte=hoy,
            fecha__lte=fecha_limite,
        )
        .order_by("fecha", "hora_inicio")
        .first()
    )


def _destinatarios_reunion_virtual(estudio):
    solicitud = getattr(estudio, "solicitud", None)
    candidato = getattr(solicitud, "candidato", None)
    analista = getattr(solicitud, "analista", None)
    empresa = getattr(solicitud, "empresa", None)
    destinatarios = []

    if getattr(candidato, "email", None):
        nombre = _nombre_persona(candidato, "candidato")
        destinatarios.append({
            "email": candidato.email,
            "rol": "CANDIDATO",
            "nombre": nombre,
            "saludo": f"Hola {nombre}",
        })
    if getattr(analista, "email", None):
        nombre = _nombre_persona(analista, "analista")
        destinatarios.append({
            "email": analista.email,
            "rol": "ANALISTA",
            "nombre": nombre,
            "saludo": f"Hola {nombre}",
        })
    if getattr(empresa, "email_contacto", None):
        destinatarios.append({
            "email": empresa.email_contacto,
            "rol": "CLIENTE",
            "nombre": getattr(empresa, "nombre", None) or "cliente",
            "saludo": "Hola cliente",
        })
    return destinatarios


def _contexto_evento_reunion(evento, estudio, slot=None, reunion=None, actor=None, meeting_url=""):
    actor_nombre = _nombre_persona(actor, "El sistema")
    candidato = getattr(getattr(estudio, "solicitud", None), "candidato", None)
    analista = getattr(getattr(estudio, "solicitud", None), "analista", None)
    empresa = getattr(getattr(estudio, "solicitud", None), "empresa", None)

    eventos = {
        "DISPONIBILIDAD": {
            "asunto": f"Ya hay disponibilidad para la reuniÃ³n virtual del estudio #{estudio.id}",
            "etiqueta": "Disponibilidad de reuniÃ³n virtual",
            "titulo": f"Ya hay fechas disponibles para el estudio #{estudio.id}",
            "mensaje": "La agenda de la reuniÃ³n virtual ya tiene al menos un horario disponible dentro del plazo permitido para agendar.",
            "detalle_evento": f"{actor_nombre} registrÃ³ disponibilidad para este estudio.",
            "estado": "DISPONIBLE",
            "color_texto": "#1d4ed8",
            "color_fondo": "#dbeafe",
            "color_borde": "#93c5fd",
            "accion_label": "Ir a la plataforma",
        },
        "APARTADA": {
            "asunto": f"La reuniÃ³n virtual del estudio #{estudio.id} fue agendada",
            "etiqueta": "ReuniÃ³n virtual agendada",
            "titulo": f"La reuniÃ³n virtual del estudio #{estudio.id} ya fue apartada",
            "mensaje": "Se reservÃ³ un horario para la reuniÃ³n virtual de este estudio y el espacio quedÃ³ bloqueado para otros candidatos.",
            "detalle_evento": f"{actor_nombre} apartÃ³ el horario de la reuniÃ³n virtual.",
            "estado": "RESERVADA",
            "color_texto": "#92400e",
            "color_fondo": "#fef3c7",
            "color_borde": "#fcd34d",
            "accion_label": "Ver estudio",
        },
        "CREADA": {
            "asunto": f"La reuniÃ³n virtual del estudio #{estudio.id} ya fue creada",
            "etiqueta": "ReuniÃ³n virtual confirmada",
            "titulo": f"La reuniÃ³n virtual del estudio #{estudio.id} ya fue creada",
            "mensaje": "La reuniÃ³n virtual ya quedÃ³ creada y confirmada para este estudio.",
            "detalle_evento": f"{actor_nombre} confirmÃ³ la reuniÃ³n virtual y dejÃ³ el enlace disponible.",
            "estado": "CONFIRMADA",
            "color_texto": "#166534",
            "color_fondo": "#dcfce7",
            "color_borde": "#86efac",
            "accion_label": "Abrir reuniÃ³n" if meeting_url else "Ver estudio",
        },
        "CANCELADA": {
            "asunto": f"La reuniÃ³n virtual del estudio #{estudio.id} fue cancelada",
            "etiqueta": "ReuniÃ³n virtual cancelada",
            "titulo": f"La reuniÃ³n virtual del estudio #{estudio.id} fue cancelada",
            "mensaje": "La reuniÃ³n virtual de este estudio fue cancelada y el horario quedÃ³ liberado nuevamente.",
            "detalle_evento": f"{actor_nombre} cancelÃ³ la reuniÃ³n virtual.",
            "estado": "CANCELADA",
            "color_texto": "#b91c1c",
            "color_fondo": "#fee2e2",
            "color_borde": "#fca5a5",
            "accion_label": "Ir a la plataforma",
        },
    }
    base = eventos[evento]
    return {
        **base,
        "estudio_id": estudio.id,
        "solicitud_id": getattr(getattr(estudio, "solicitud", None), "id", None),
        "candidato_nombre": _nombre_persona(candidato, "Sin candidato"),
        "analista_nombre": _nombre_persona(analista, "Sin analista"),
        "empresa_nombre": getattr(empresa, "nombre", None) or "Sin empresa",
        "fecha_reunion": getattr(slot, "fecha", None),
        "hora_inicio": getattr(slot, "hora_inicio", None),
        "hora_fin": getattr(slot, "hora_fin", None),
        "fecha_limite": getattr(reunion, "fecha_limite_agendamiento", None) or estudio.fecha_limite_agendamiento(),
        "meeting_url": meeting_url or "",
        "nota": getattr(reunion, "nota", "") if reunion else "",
    }


def _enviar_correos_reunion_virtual(estudio, evento, slot=None, reunion=None, actor=None, meeting_url=""):
    contexto_base = _contexto_evento_reunion(
        evento=evento,
        estudio=estudio,
        slot=slot,
        reunion=reunion,
        actor=actor,
        meeting_url=meeting_url,
    )
    for destinatario in _destinatarios_reunion_virtual(estudio):
        contexto = {
            **contexto_base,
            "destinatario_nombre": destinatario["nombre"],
            "saludo": destinatario["saludo"],
            "accion_url": meeting_url if (evento == "CREADA" and meeting_url) else _frontend_link_por_rol(destinatario["rol"]),
        }
        mensaje_html = render_to_string("emails/reunion_virtual_actualizada.html", contexto)
        mensaje_txt = render_to_string("emails/reunion_virtual_actualizada.txt", contexto)
        send_mail(
            subject=contexto["asunto"],
            message=mensaje_txt,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[destinatario["email"]],
            html_message=mensaje_html,
            fail_silently=True,
        )


# Resample compatible Pillow
RESAMPLE = getattr(getattr(Image, "Resampling", Image), "LANCZOS", Image.BICUBIC) if Image else None


def _abs_file_url(request, f_or_url):
    """URL absoluta para FileField o string URL."""
    if not f_or_url:
        return None
    url = None
    if hasattr(f_or_url, "url"):
        try:
            url = f_or_url.url
        except Exception:
            url = None
    elif isinstance(f_or_url, str):
        url = f_or_url
    if url and not url.startswith("http"):
        return request.build_absolute_uri(url)
    return url


def _draw_link_text(c, x, y, label, url, font="Helvetica", size=10, color="#60a5fa"):
    """Dibuja texto subrayado y le agrega una anotaciÃ³n linkURL clickeable."""
    c.setFont(font, size)
    old = c.getFillColor()
    c.setFillColor(colors.HexColor(color))
    c.drawString(x, y, label)
    w = c.stringWidth(label, font, size)
    c.linkURL(url, (x, y - 2, x + w, y + size + 2), relative=0)
    c.setFillColor(old)
    return w


def _image_reader_from_field(filefield):
    """Convierte un FileField a ImageReader (sirve con S3 o FS)."""
    if not filefield:
        return None
    try:
        filefield.open("rb")
        data = filefield.read()
        filefield.close()
        return ImageReader(io.BytesIO(data))
    except Exception:
        return None


def _image_reader_from_logo_url(request, logo_url):
    """Intenta cargar logo desde URL absoluta o ruta local /media/..."""
    if not logo_url:
        return None
    try:
        if isinstance(logo_url, str) and logo_url.startswith("/"):
            media_url = str(getattr(settings, "MEDIA_URL", "/media/") or "/media/")
            media_root = str(getattr(settings, "MEDIA_ROOT", "") or "")
            if media_root and logo_url.startswith(media_url):
                rel = logo_url[len(media_url):].lstrip("/")
                local_path = os.path.join(media_root, rel)
                if os.path.exists(local_path):
                    return ImageReader(local_path)
            base_dir = str(getattr(settings, "BASE_DIR", "") or "")
            local_path = os.path.join(base_dir, logo_url.lstrip("/"))
            if os.path.exists(local_path):
                return ImageReader(local_path)

        url = logo_url
        if isinstance(url, str) and not url.startswith(("http://", "https://")) and request is not None:
            url = request.build_absolute_uri(url)
        if isinstance(url, str) and url.startswith(("http://", "https://")):
            with urllib.request.urlopen(url, timeout=3) as resp:
                data = resp.read()
            return ImageReader(io.BytesIO(data))
    except Exception:
        return None
    return None


def _wrap_pdf_text(text, max_len=95):
    raw = str(text or "").strip()
    if not raw:
        return []
    words = raw.split()
    lines, line = [], ""
    for w in words:
        nxt = f"{line} {w}".strip()
        if len(nxt) <= max_len:
            line = nxt
        else:
            if line:
                lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def _dataurl_to_contentfile(dataurl, name):
    if not (dataurl or "").startswith("data:image"):
        return None
    try:
        _, b64data = dataurl.split(",", 1)
        return ContentFile(base64.b64decode(b64data), name=name)
    except Exception:
        return None


def _dataurl_to_image(dataurl: str):
    if not Image:
        return None
    cf = _dataurl_to_contentfile(dataurl, "tmp.png")
    if not cf:
        return None
    try:
        return Image.open(io.BytesIO(cf.read())).convert("RGBA")
    except Exception:
        return None


def _stack_two_signatures(draw_b64: str, upload_b64: str):
    """Une dos firmas (dataURL) verticalmente en PNG y devuelve ContentFile."""
    if not Image:
        return None
    img1 = _dataurl_to_image(draw_b64)
    img2 = _dataurl_to_image(upload_b64)
    if not img1 or not img2:
        return None

    max_w = max(img1.width, img2.width)

    def _fit_w(img, w):
        if img.width == w:
            return img
        ratio = w / float(img.width)
        return img.resize((w, int(img.height * ratio)), RESAMPLE or Image.BICUBIC)

    img1 = _fit_w(img1, max_w)
    img2 = _fit_w(img2, max_w)

    margin = 16
    total_h = img1.height + img2.height + margin
    can = Image.new("RGBA", (max_w, total_h), (255, 255, 255, 255))
    can.paste(img1, (0, 0), img1)
    can.paste(img2, (0, img1.height + margin), img2)

    buf = io.BytesIO()
    can.convert("RGB").save(buf, format="PNG", optimize=True)
    buf.seek(0)
    return ContentFile(buf.read(), name="firmas_combinadas.png")


def _bump_progreso(est: Estudio, valor) -> int:
    """Solo sube el progreso; nunca lo baja."""
    try:
        nuevo = int(round(max(0, min(100, float(valor)))))
    except Exception:
        nuevo = int(est.progreso or 0)

    actual = int(est.progreso or 0)
    if nuevo > actual:
        Estudio.objects.filter(pk=est.pk).update(progreso=nuevo)
        est.progreso = nuevo
    return est.progreso


def _recalcular_progreso_anexos(est: Estudio) -> int:
    """
    % de anexos resueltos por tipo (archivo o no_aplica),
    considerando Ãºnicamente los tipos vigentes que mostramos en el UI.
    Excluye 'FRENTE_ASPIRANTE'.
    """
    activos = {
        # Acceso
        "FACHADA_GENERAL", "FACHADA_POSTERIOR", "NOMENCLATURA", "ENTRADA", "ESCALERAS",
        # Zonas sociales
        "SALA_GENERAL", "SALA_POSTERIOR", "COMEDOR", "HALL_CORREDOR",
        # Servicios
        "COCINA", "BANO_1", "BANO_2", "ZONA_LAVADO",
        # Habitaciones
        "ESTUDIO", "HABITACION_1", "HABITACION_2", "HABITACION_3",
        # Exteriores
        "PATIO_1", "PATIO_2", "BALCON_1", "BALCON_2", "ZONAS_ALED_1", "ZONAS_ALED_2",
        # Conjunto / comunes usados por el front
        "PARQUES", "GIMNASIO", "TERRAZA", "PARQUEADERO_1", "PARQUEADERO_2",
        "TORRE", "RECEPCION", "ASCENSORES", "TURCO", "SAUNA", "JACUZZI", "BBQ",
        # Legados (si quieres contarlos cuando existan)
        "PATIO_BALCON_1", "PATIO_BALCON_2",
        # Nota: dejamos fuera ZONAS_COMUNES / ZONAS_HUMEDAS y OTRAS_* (opcionales)
    }

    total_tipos = len(activos)
    if not total_tipos:
        return int(est.progreso or 0)

    ok_por_tipo = (
        AnexoFoto.objects
        .filter(estudio=est, tipo__in=activos)
        .filter(Q(no_aplica=True) | (Q(archivo__isnull=False) & ~Q(archivo="")))
        .values("tipo")
        .distinct()
        .count()
    )

    pct = int(round((ok_por_tipo / total_tipos) * 100))
    return _bump_progreso(est, pct)


def _ensure_item_modulo(estudio: Estudio, tipo: str) -> EstudioItem:
    item, created = EstudioItem.objects.get_or_create(
        estudio=estudio,
        tipo=tipo,
        defaults={"estado": "PENDIENTE"},
    )
    if not created and item.estado == "CERRADO":
        item.estado = "PENDIENTE"
        item.save(update_fields=["estado"])
    return item


def _latest_previous_study(candidato, exclude_estudio_id=None):
    qs = Estudio.objects.filter(solicitud__candidato=candidato)
    if exclude_estudio_id:
        qs = qs.exclude(pk=exclude_estudio_id)
    return qs.order_by("-solicitud__created_at", "-id").first()


def _clone_model_rows(model, source_qs, *, estudio_destino, candidato_destino):
    model_fields = {f.name: f for f in model._meta.fields}
    has_candidato = "candidato" in model_fields

    for obj in source_qs:
        payload = {}
        for f in model._meta.fields:
            if f.primary_key or f.auto_created:
                continue
            if f.name in {"estudio", "candidato", "creado", "created_at", "updated_at"}:
                continue

            value = getattr(obj, f.name, None)
            if f.is_relation and f.many_to_one:
                payload[f.name + "_id"] = value.id if value else None
            else:
                if hasattr(value, "name"):  # FileField
                    payload[f.name] = value.name if value else None
                else:
                    payload[f.name] = value

        payload["estudio"] = estudio_destino
        if has_candidato:
            payload["candidato"] = candidato_destino
        model.objects.create(**payload)


def _migrate_relevant_data_from_previous_study(prev_est: Estudio, new_est: Estudio):
    if not prev_est or not new_est:
        return

    cand = new_est.solicitud.candidato

    _clone_model_rows(Academico, Academico.objects.filter(estudio=prev_est).order_by("id"), estudio_destino=new_est, candidato_destino=cand)
    _clone_model_rows(Laboral, Laboral.objects.filter(estudio=prev_est).order_by("id"), estudio_destino=new_est, candidato_destino=cand)
    _clone_model_rows(Economica, Economica.objects.filter(estudio=prev_est).order_by("id"), estudio_destino=new_est, candidato_destino=cand)
    _clone_model_rows(ReferenciaPersonal, ReferenciaPersonal.objects.filter(estudio=prev_est).order_by("id"), estudio_destino=new_est, candidato_destino=cand)
    _clone_model_rows(Patrimonio, Patrimonio.objects.filter(estudio=prev_est).order_by("id"), estudio_destino=new_est, candidato_destino=cand)

    # Datos principalmente Ãºtiles para analista:
    _clone_model_rows(EstudioReferencia, EstudioReferencia.objects.filter(estudio=prev_est).order_by("id"), estudio_destino=new_est, candidato_destino=cand)
    _clone_model_rows(
        EstudioDocumento,
        EstudioDocumento.objects.filter(estudio=prev_est, categoria="CENTRALES").order_by("id"),
        estudio_destino=new_est,
        candidato_destino=cand,
    )

# ======================================================================================
# Helper: llenado real del candidato por mÃ³dulo
# ======================================================================================

def _candidato_fill(est: Estudio):
    """
    Devuelve (fill_dict, progreso_pct) donde fill_dict mapea tipo de item Ã¢â€ â€™
      True  = candidato ya ingresÃ³ datos en este mÃ³dulo,
      False = mÃ³dulo vacÃ­o,
      None  = mÃ³dulo que llena el analista (N/A para candidato).
    """
    cand = est.solicitud.candidato

    fill = {}

    # BIOGRAFICOS â€” campos clave del candidato
    bio_fields = ["fecha_nacimiento", "telefono", "celular", "direccion", "sexo", "estatura_cm"]
    fill["BIOGRAFICOS"] = any(getattr(cand, f, None) for f in bio_fields)

    # INFO_FAMILIAR
    try:
        fill["INFO_FAMILIAR"] = bool(getattr(cand, "informacion_familiar", None))
    except Exception:
        fill["INFO_FAMILIAR"] = False

    # VIVIENDA
    try:
        fill["VIVIENDA"] = bool(getattr(cand, "descripcion_vivienda", None))
    except Exception:
        fill["VIVIENDA"] = False

    # ACADEMICO
    fill["ACADEMICO"] = est.academicos.exists()

    # LABORAL
    fill["LABORAL"] = est.laborales.exists()

    # REFERENCIAS
    try:
        refs = est.referencias.exists()
    except Exception:
        refs = False
    try:
        refs_p = est.refs_personales.exists()
    except Exception:
        refs_p = False
    fill["REFERENCIAS"] = refs or refs_p

    # ECONOMICA
    fill["ECONOMICA"] = est.economicas.exists()

    # PATRIMONIO
    try:
        fill["PATRIMONIO"] = est.patrimonios.exists()
    except Exception:
        fill["PATRIMONIO"] = False

    # DOCUMENTOS
    fill["DOCUMENTOS"] = est.documentos.exists()

    # ANEXOS_FOTOGRAFICOS
    fill["ANEXOS_FOTOGRAFICOS"] = est.anexos_foto.exists()

    # LISTAS_RESTRICTIVAS â€” lo llena el analista, no el candidato
    fill["LISTAS_RESTRICTIVAS"] = None

    # Progreso candidato: solo mÃ³dulos con valor bool (excluye None)
    candidate_modules = [k for k, v in fill.items() if v is not None]
    filled = sum(1 for k in candidate_modules if fill[k])
    pct = round((filled / len(candidate_modules)) * 100.0, 1) if candidate_modules else 0.0

    return fill, pct


# ======================================================================================
# Solicitudes
# ======================================================================================

class SolicitudViewSet(viewsets.ModelViewSet):
    queryset = Solicitud.objects.all().select_related("candidato", "empresa", "analista")
    serializer_class = SolicitudCreateSerializer

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        rol = getattr(user, "rol", None)

        if rol == "ADMIN":
            return qs
        if rol == "CLIENTE":
            return qs.filter(empresa=user.empresa)
        if rol == "ANALISTA":
            return qs.filter(analista=user)
        if rol == "CANDIDATO":
            return qs.filter(candidato__email=user.email)
        return qs.none()

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if getattr(self.request.user, "empresa", None):
            ctx["empresa"] = self.request.user.empresa
        return ctx

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        if getattr(request.user, "rol", None) == "CLIENTE":
            data.pop("empresa", None)

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def perform_create(self, serializer):
        emp = getattr(self.request.user, "empresa", None)
        if not emp:
            raise ValidationError({"empresa": ["El usuario cliente no tiene empresa asociada."]})

        # Marcar estudio como "a consideraciÃ³n del cliente" SOLO si las polÃ­ticas estÃ¡n
        # actualmente bloqueadas (el cliente las configurÃ³ y aÃºn no las ha desbloqueado el admin).
        # Si el admin desbloqueÃ³ (bloqueado=False) o el cliente nunca las configurÃ³, no aplica.
        from .models import ClientePoliticaConfiguracion, ClienteConfiguracionFormulario
        politicas_bloqueadas_activas = ClientePoliticaConfiguracion.objects.filter(
            empresa=emp, bloqueado=True, no_relevante=True
        ).exists()
        subitems_excluidos = ClienteConfiguracionFormulario.objects.filter(empresa=emp, excluido=True).exists()
        usar_politicas_cliente = politicas_bloqueadas_activas  # se activa automÃ¡ticamente si polÃ­ticas estÃ¡n bloqueadas

        solicitud = serializer.save(empresa=emp)
        solicitud.estado = getattr(getattr(Solicitud, "Estado", None), "PENDIENTE_INVITACION", "PENDIENTE_INVITACION")
        solicitud.save(update_fields=["estado"])

        nuevo_estudio = getattr(solicitud, "estudio", None)
        if nuevo_estudio:
            previo = _latest_previous_study(solicitud.candidato, exclude_estudio_id=nuevo_estudio.id)
            if previo:
                _migrate_relevant_data_from_previous_study(previo, nuevo_estudio)

        # Si se crea el Estudio aquÃ­, marcarlo como a_consideracion_cliente si corresponde
        if hasattr(solicitud, "estudio"):
            estudio = solicitud.estudio
            if usar_politicas_cliente or subitems_excluidos:
                estudio.a_consideracion_cliente = True
                estudio.save(update_fields=["a_consideracion_cliente"])

        # AsignaciÃ³n equitativa (round-robin): el analista con menos estudios asignados
        User = get_user_model()
        analista = None
        for scope in [
            User.objects.filter(rol="ANALISTA", is_active=True, empresa=emp),
            User.objects.filter(rol="ANALISTA", is_active=True),
        ]:
            analista = (
                scope
                .annotate(num_solicitudes=Count("solicitudes"))
                .order_by("num_solicitudes", "id")
                .first()
            )
            if analista:
                break
        if analista and not solicitud.analista_id:
            solicitud.analista = analista
            solicitud.save(update_fields=["analista"])

        if solicitud.analista_id:
            Notificacion.objects.create(
                user=solicitud.analista,
                tipo="NUEVA_SOLICITUD",
                titulo=f"Nueva solicitud #{solicitud.id}",
                cuerpo=(
                    f"Empresa: {solicitud.empresa} â€” "
                    f"Candidato: {solicitud.candidato.nombre} {solicitud.candidato.apellido} "
                    f"({solicitud.candidato.cedula})"
                ),
                solicitud=solicitud,
            )
            # Enviar notificaciÃ³n al analista
            if solicitud.analista and solicitud.analista.email:
                asunto = f"Nueva solicitud asignada #{solicitud.id}"
                mensaje = (
                    f"Se ha creado la solicitud #{solicitud.id} para "
                    f"{solicitud.candidato.nombre} {solicitud.candidato.apellido}."
                )
                context = {
                    "subject": asunto,
                    "saludo": f"Hola {solicitud.analista.first_name or solicitud.analista.username}",
                    "mensaje": mensaje,
                    "candidato_nombre": f"{solicitud.candidato.nombre} {solicitud.candidato.apellido}",
                    "candidato_cedula": solicitud.candidato.cedula,
                    "solicitud_id": solicitud.id,
                    "estado": getattr(solicitud, "estado", "Creada")
                }
                mensaje_html = render_to_string("emails/notificacion_general.html", context)
                mensaje_txt = render_to_string("emails/notificacion_general.txt", context)
                send_mail(
                    subject=asunto,
                    message=mensaje_txt,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[solicitud.analista.email],
                    html_message=mensaje_html,
                    fail_silently=True,
                )

    @action(detail=True, methods=["post"])
    def invitar_candidato(self, request, pk=None):
        if getattr(request.user, "rol", None) not in ("ANALISTA", "ADMIN"):
            return Response({"detail": "Sin permiso."}, status=status.HTTP_403_FORBIDDEN)

        solicitud = self.get_object()
        cand = solicitud.candidato
        if not cand.email:
            return Response({"detail": "El candidato no tiene email."}, status=400)

        User = get_user_model()
        user = User.objects.filter(email=cand.email).first()
        temp_password = None
        access_hours = 24

        if not user:
            base_username = cand.email or f"cand_{cand.cedula}"
            username = base_username
            i = 1
            while User.objects.filter(username=username).exists():
                username = f"{base_username}_{i}"
                i += 1
            temp_password = get_random_string(10)
            access_deadline = timezone.now() + timedelta(hours=access_hours)
            user = User.objects.create_user(
                username=username,
                email=cand.email,
                password=temp_password,
                rol="CANDIDATO",
                candidate_access_expires_at=access_deadline,
                is_active=True,
            )
        else:
            access_deadline = getattr(user, "candidate_access_expires_at", None)
            if getattr(user, "rol", None) == "CANDIDATO" and not access_deadline:
                access_deadline = user.date_joined + timedelta(hours=access_hours)

        frontend = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
        link = f"{frontend}/candidato"


        asunto = f"Acceso para completar su estudio (Solicitud #{solicitud.id})"
        context_candidato = {
                "subject": asunto,
                "nombre": cand.nombre,
                "apellido": cand.apellido,
                "cedula": cand.cedula,
                "solicitud_id": solicitud.id,
                "usuario": user.username,
                "temp_password": temp_password,
                "link": link,
                "access_hours": access_hours,
                "access_deadline": access_deadline,
            }
        mensaje_html_candidato = render_to_string("emails/invitacion_candidato.html", context_candidato)
        mensaje_txt_candidato = render_to_string("emails/invitacion_candidato.txt", context_candidato)
        send_mail(
                asunto,
                mensaje_txt_candidato,
                settings.DEFAULT_FROM_EMAIL,
                [cand.email],
                html_message=mensaje_html_candidato,
                fail_silently=True,
            )

            # Enviar al cliente (mensaje formal)
        email_cliente = getattr(solicitud.empresa, "email_contacto", None)
        if email_cliente:
            asunto_cliente = f"Su estudio ha sido enviado al analista (Solicitud #{solicitud.id})"
            context_cliente = {
                "subject": asunto_cliente,
                "nombre": cand.nombre,
                "apellido": cand.apellido,
                "cedula": cand.cedula,
                "solicitud_id": solicitud.id,
                "estado": "Su estudio ha sido enviado al analista. Espere activaciÃ³n.",
            }
            mensaje_html_cliente = render_to_string("emails/invitacion_cliente.html", context_cliente)
            mensaje_txt_cliente = render_to_string("emails/invitacion_cliente.txt", context_cliente)
            send_mail(
                asunto_cliente,
                mensaje_txt_cliente,
                settings.DEFAULT_FROM_EMAIL,
                [email_cliente],
                html_message=mensaje_html_cliente,
                fail_silently=True,
            )

        try:
            solicitud.estado = getattr(getattr(Solicitud, "Estado", None), "INVITADO", "INVITADO")
            solicitud.save(update_fields=["estado"])
        except Exception:
            pass

        estudio = getattr(solicitud, "estudio", None)
        if estudio:
            estudio.marcar_habilitado_para_candidato()
            slot_disponible = _primer_slot_disponible_para_estudio(estudio)
            if slot_disponible:
                transaction.on_commit(
                    lambda estudio_id=estudio.id, slot_id=slot_disponible.id, actor_id=request.user.id: _enviar_correos_reunion_virtual(
                        estudio=Estudio.objects.select_related("solicitud", "solicitud__candidato", "solicitud__analista", "solicitud__empresa").get(pk=estudio_id),
                        evento="DISPONIBILIDAD",
                        slot=DisponibilidadAnalista.objects.get(pk=slot_id),
                        actor=get_user_model().objects.get(pk=actor_id),
                    )
                )

        return Response({"ok": True})


# ======================================================================================
# Estudios
# ======================================================================================
class EstudioViewSet(viewsets.ReadOnlyModelViewSet):
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    queryset = (
        Estudio.objects.all()
        .select_related("solicitud", "solicitud__candidato", "solicitud__empresa", "solicitud__analista", "visita_virtual")
        .prefetch_related("items", "documentos","consentimientos")
    )
    serializer_class = EstudioSerializer

    def get_serializer_class(self):
        rol = getattr(getattr(self, "request", None), "user", None)
        rol = getattr(rol, "rol", None)
        if self.action == "list" and rol == "CLIENTE":
            return EstudioClienteListSerializer
        return super().get_serializer_class()

    @staticmethod
    def _is_owner(est, user):
        """True si el usuario puede editar este estudio (es ADMIN o el analista asignado)."""
        rol = getattr(user, "rol", None)
        if rol == "ADMIN":
            return True
        if rol == "ANALISTA":
            return getattr(est.solicitud, "analista_id", None) == user.id
        return True  # CLIENTE/CANDIDATO tienen sus propias restricciones

    def _check_owner(self, est, request):
        """Lanza 403 si el analista no es el propietario del estudio."""
        # Solo el analista asignado puede editar/calificar
        if getattr(request.user, "rol", None) == "ANALISTA":
            analista = getattr(est.solicitud, "analista", None)
            if not (analista and analista.id == request.user.id):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Solo el analista asignado puede editar este estudio.")
        # Admin puede todo, los demÃ¡s roles no editan
        return None

    @staticmethod
    def _serialize_visita(vv, include_location=False):
        if not vv:
            return {"exists": False, "estado": "NO_INICIADA"}

        data = {
            "exists": True,
            "id": vv.id,
            "meeting_url": vv.meeting_url,
            "estado": vv.estado,
            "consentida_por_candidato": bool(vv.consentida_por_candidato),
            "consentida_at": vv.consentida_at,
            "activa_desde": vv.activa_desde,
            "finalizada_at": vv.finalizada_at,
            "ultima_actualizacion_at": vv.ultima_actualizacion_at,
        }
        if include_location:
            data.update(
                {
                    "ultima_latitud": vv.ultima_latitud,
                    "ultima_longitud": vv.ultima_longitud,
                    "ultima_precision_m": vv.ultima_precision_m,
                }
            )
        return data

    @action(detail=True, methods=["get"], url_path="visita-virtual")
    def visita_virtual(self, request, pk=None):
        est = self.get_object()
        rol = str(getattr(request.user, "rol", "")).upper()

        if rol == "ADMIN":
            vv = getattr(est, "visita_virtual", None)
            return Response(self._serialize_visita(vv, include_location=True))

        if rol == "ANALISTA":
            vv = getattr(est, "visita_virtual", None)
            # El propietario ve ubicaciÃ³n; otros analistas solo ven estado bÃ¡sico
            is_owner = (
                getattr(est.solicitud, "analista", None) and
                est.solicitud.analista.id == request.user.id
            )
            return Response(self._serialize_visita(vv, include_location=is_owner))

        if rol == "CANDIDATO":
            if est.solicitud.candidato.email != getattr(request.user, "email", None):
                return Response({"detail": "Sin permiso."}, status=403)
            vv = getattr(est, "visita_virtual", None)
            return Response(self._serialize_visita(vv, include_location=False))

        return Response({"detail": "Sin permiso."}, status=403)

    @action(detail=True, methods=["post"], url_path="visita-virtual/iniciar")
    def visita_virtual_iniciar(self, request, pk=None):
        est = self.get_object()
        rol = str(getattr(request.user, "rol", "")).upper()
        if rol not in {"ANALISTA", "ADMIN"}:
            return Response({"detail": "Sin permiso."}, status=403)
        denied = self._check_owner(est, request)
        if denied:
            return denied

        meeting_url = (request.data.get("meeting_url") or "").strip()
        if not meeting_url:
            return Response({"meeting_url": ["Requerido."]}, status=400)
        if not meeting_url.startswith(("https://", "http://")):
            return Response({"meeting_url": ["Debe iniciar con http:// o https://"]}, status=400)

        vv, created = EstudioVisitaVirtual.objects.get_or_create(
            estudio=est,
            defaults={"meeting_url": meeting_url, "creada_por": request.user},
        )
        if not created:
            vv.meeting_url = meeting_url
        vv.estado = VisitaVirtualEstado.ACTIVA
        vv.finalizada_at = None
        vv.consentida_por_candidato = False
        vv.consentida_at = None
        vv.ultima_latitud = None
        vv.ultima_longitud = None
        vv.ultima_precision_m = None
        vv.ultima_actualizacion_at = None
        vv.save()

        reunion = getattr(est, "reunion_agendada", None)
        if reunion and reunion.estado == ReunionVirtualAgendada.Estado.PENDIENTE:
            reunion.estado = ReunionVirtualAgendada.Estado.CONFIRMADA
            reunion.save(update_fields=["estado"])

        transaction.on_commit(
            lambda estudio_id=est.id, actor_id=request.user.id: _enviar_correos_reunion_virtual(
                estudio=Estudio.objects.select_related("solicitud", "solicitud__candidato", "solicitud__analista", "solicitud__empresa").get(pk=estudio_id),
                evento="CREADA",
                slot=getattr(ReunionVirtualAgendada.objects.select_related("slot").filter(estudio_id=estudio_id).first(), "slot", None),
                reunion=ReunionVirtualAgendada.objects.select_related("slot").filter(estudio_id=estudio_id).first(),
                actor=get_user_model().objects.get(pk=actor_id),
                meeting_url=vv.meeting_url,
            )
        )

        return Response(self._serialize_visita(vv, include_location=True), status=201 if created else 200)

    @action(detail=True, methods=["post"], url_path="visita-virtual/finalizar")
    def visita_virtual_finalizar(self, request, pk=None):
        est = self.get_object()
        rol = str(getattr(request.user, "rol", "")).upper()
        if rol not in {"ANALISTA", "ADMIN"}:
            return Response({"detail": "Sin permiso."}, status=403)
        denied = self._check_owner(est, request)
        if denied:
            return denied

        vv = getattr(est, "visita_virtual", None)
        if not vv:
            return Response({"detail": "No hay reuniÃ³n virtual activa para este estudio."}, status=404)

        vv.estado = VisitaVirtualEstado.FINALIZADA
        vv.finalizada_at = timezone.now()
        vv.save(update_fields=["estado", "finalizada_at", "updated_at"])

        reunion = getattr(est, "reunion_agendada", None)
        if reunion and reunion.estado in (
            ReunionVirtualAgendada.Estado.PENDIENTE,
            ReunionVirtualAgendada.Estado.CONFIRMADA,
        ):
            reunion.estado = ReunionVirtualAgendada.Estado.REALIZADA
            reunion.save(update_fields=["estado"])

        return Response(self._serialize_visita(vv, include_location=True))

    @action(detail=True, methods=["post"], url_path="visita-virtual/consentir")
    def visita_virtual_consentir(self, request, pk=None):
        est = self.get_object()
        if str(getattr(request.user, "rol", "")).upper() != "CANDIDATO":
            return Response({"detail": "Sin permiso."}, status=403)
        if est.solicitud.candidato.email != getattr(request.user, "email", None):
            return Response({"detail": "Sin permiso."}, status=403)

        vv = getattr(est, "visita_virtual", None)
        if not vv or vv.estado != VisitaVirtualEstado.ACTIVA:
            return Response({"detail": "No hay reuniÃ³n virtual activa."}, status=400)

        vv.consentida_por_candidato = True
        vv.consentida_at = timezone.now()
        vv.save(update_fields=["consentida_por_candidato", "consentida_at", "updated_at"])
        return Response({"ok": True, "consentida_at": vv.consentida_at})

    @action(detail=True, methods=["post"], url_path="visita-virtual/ubicacion")
    def visita_virtual_ubicacion(self, request, pk=None):
        est = self.get_object()
        if str(getattr(request.user, "rol", "")).upper() != "CANDIDATO":
            return Response({"detail": "Sin permiso."}, status=403)
        if est.solicitud.candidato.email != getattr(request.user, "email", None):
            return Response({"detail": "Sin permiso."}, status=403)

        vv = getattr(est, "visita_virtual", None)
        if not vv or vv.estado != VisitaVirtualEstado.ACTIVA:
            return Response({"detail": "No hay reuniÃ³n virtual activa."}, status=400)
        if not vv.consentida_por_candidato:
            return Response({"detail": "Debes aceptar compartir ubicaciÃ³n antes de enviar coordenadas."}, status=400)

        try:
            lat = Decimal(str(request.data.get("lat")))
            lng = Decimal(str(request.data.get("lng")))
        except (InvalidOperation, TypeError, ValueError):
            return Response({"detail": "lat/lng invÃ¡lidos."}, status=400)

        if lat < Decimal("-90") or lat > Decimal("90") or lng < Decimal("-180") or lng > Decimal("180"):
            return Response({"detail": "lat/lng fuera de rango."}, status=400)

        precision = request.data.get("accuracy")
        try:
            precision = Decimal(str(precision)) if precision is not None else None
        except (InvalidOperation, TypeError, ValueError):
            precision = None

        vv.ultima_latitud = lat
        vv.ultima_longitud = lng
        vv.ultima_precision_m = precision
        vv.ultima_actualizacion_at = timezone.now()
        vv.save(update_fields=["ultima_latitud", "ultima_longitud", "ultima_precision_m", "ultima_actualizacion_at", "updated_at"])

        return Response({"ok": True, "ultima_actualizacion_at": vv.ultima_actualizacion_at})


    
    @action(detail=True, methods=["get", "post"])
    def referencias(self, request, pk=None):
        est = self.get_object()

        if request.method == "GET":
            qs = EstudioReferencia.objects.filter(estudio=est).order_by("-id")
            if qs.exists():
                ser = EstudioReferenciaSerializer(qs, many=True, context={"request": request})
                # Ã¢Å“â€¦ el front soporta lista o {laborales,personales}; devolver lista aquÃ­ ok
                return Response(ser.data)

            # Ã°Å¸â€Â Fallback: derivar de registros Laboral si no hay referencias guardadas
            labs = (Laboral.objects
                    .filter(estudio=est)
                    .order_by("-creado"))
            laborales = []
            for l in labs:
                nombre = (l.referencia_nombre or l.jefe_inmediato or "").strip()
                if not (nombre or l.referencia_telefono or l.telefono):
                    continue
                laborales.append({
                    "tipo": "LABORAL",
                    "nombres": nombre,
                    "apellidos": "",
                    "telefono": (l.referencia_telefono or l.telefono or ""),
                    "relacion": (l.cargo or "Referencia laboral"),
                    "comentario": "",
                })
                if len(laborales) >= 3:
                    break

            # Si no tienes de dÃ³nde sacar personales, dÃ©jalo vacÃ­o.
            personales = []

            # Ã¢Å“â€¦ El front tambiÃ©n soporta este formato
            return Response({"laborales": laborales, "personales": personales})

        # POST (append)
        rol = str(getattr(request.user, "rol", "")).upper()
        if rol not in {"ANALISTA", "ADMIN"}:
            return Response({"detail": "Sin permiso."}, status=403)
        if (est.estado or "").upper() == "CERRADO":
            return Response({"detail": "El estudio estÃ¡ cerrado."}, status=400)

        rows = _collect_refs_from_request(request.data)
        if not rows:
            return Response({"detail": "Payload vacÃ­o o invÃ¡lido."}, status=400)

        objs = [
            EstudioReferencia(
                estudio=est,
                nombres=r["nombres"],
                apellidos=r.get("apellidos", ""),
                telefono=r.get("telefono", ""),
                relacion=r.get("relacion", ""),
                comentario=r.get("comentario", ""),
                creado_por=request.user if getattr(request.user, "is_authenticated", False) else None,
            ) for r in rows
        ]
        EstudioReferencia.objects.bulk_create(objs)

        qs = EstudioReferencia.objects.filter(estudio=est).order_by("-id")
        ser = EstudioReferenciaSerializer(qs, many=True, context={"request": request})
        return Response(ser.data, status=status.HTTP_201_CREATED)


    @action(detail=True, methods=["post"])
    def referencias_set(self, request, pk=None):
        """
        Reemplaza TODAS las referencias del estudio por las recibidas.
        Acepta {referencias:[...]}, {laborales:[], personales:[]}, o una lista directa.
        """
        est = self.get_object()

        rol = str(getattr(request.user, "rol", "")).upper()
        if rol not in {"ANALISTA", "ADMIN"}:
            return Response({"detail": "Sin permiso."}, status=403)
        if (est.estado or "").upper() == "CERRADO":
            return Response({"detail": "El estudio estÃ¡ cerrado."}, status=400)

        rows = _collect_refs_from_request(request.data)

        from django.db import transaction
        with transaction.atomic():
            EstudioReferencia.objects.filter(estudio=est).delete()
            if rows:
                objs = []
                for r in rows:
                    objs.append(EstudioReferencia(
                        estudio=est,
                        nombres=r["nombres"],
                        apellidos=r.get("apellidos", ""),
                        telefono=r.get("telefono", ""),
                        relacion=r.get("relacion", ""),
                        comentario=r.get("comentario", ""),
                        creado_por=request.user if getattr(request.user, "is_authenticated", False) else None,
                    ))
                EstudioReferencia.objects.bulk_create(objs)

        qs = EstudioReferencia.objects.filter(estudio=est).order_by("-id")
        ser = EstudioReferenciaSerializer(qs, many=True, context={"request": request})
        return Response(ser.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=["get"])
    def candidato_bio(self, request, pk=None):
        est = self.get_object()
        cand = est.solicitud.candidato
        ser = CandidatoBioSerializer(cand, context={"request": request})
        return Response(ser.data)
    
    def _candidate_user_for(self, est):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        email = getattr(getattr(est.solicitud, "candidato", None), "email", None)
        return User.objects.filter(email=email).first()

    @action(detail=True, methods=["get", "post"])
    def evaluacion(self, request, pk=None):
        est = self.get_object()
        # crea si no existe
        ev, _ = EvaluacionTrato.objects.get_or_create(
            estudio=est,
            defaults={"candidato_user": self._candidate_user_for(est)}
        )

        if request.method == "GET":
            return Response({
                "id": ev.id,
                "submitted_at": ev.submitted_at,
                "answers": ev.answers or {},
                "pendiente": ((est.estado or "").upper() == "CERRADO" and not ev.submitted_at),
            })

        # POST -> solo candidato y con estudio cerrado
        if str(getattr(request.user, "rol", "")).upper() != "CANDIDATO" or est.solicitud.candidato.email != request.user.email:
            return Response({"detail": "Solo el candidato puede responder."}, status=403)
        if (est.estado or "").upper() != "CERRADO":
            return Response({"detail": "La evaluaciÃ³n se habilita cuando el estudio estÃ¡ cerrado."}, status=400)

        ev.answers = request.data.get("answers", {}) or {}
        ev.submitted_at = timezone.now()
        if not ev.candidato_user:
            ev.candidato_user = request.user
        ev.save(update_fields=["answers", "submitted_at", "candidato_user"])
        return Response({"ok": True})

    @action(detail=True, methods=["get", "post"], url_path="disponibilidad-reunion")
    def disponibilidad_reunion(self, request, pk=None):
        est = self.get_object()
        rol = str(getattr(request.user, "rol", "")).upper()

        if request.method == "GET":
            # ANALISTA, ADMIN y el propio CANDIDATO pueden ver
            if rol == "CANDIDATO" and est.solicitud.candidato.email != request.user.email:
                return Response({"detail": "Sin permiso."}, status=403)
            if rol not in {"CANDIDATO", "ANALISTA", "ADMIN"}:
                return Response({"detail": "Sin permiso."}, status=403)
            disp = getattr(est, "disponibilidad_reunion", None)
            if not disp:
                return Response(None)
            return Response(DisponibilidadReunionSerializer(disp).data)

        # POST â€” solo el candidato del estudio puede registrar/actualizar
        if rol != "CANDIDATO" or est.solicitud.candidato.email != request.user.email:
            return Response({"detail": "Solo el candidato puede registrar disponibilidad."}, status=403)

        disp, _ = DisponibilidadReunionCandidato.objects.get_or_create(estudio=est)
        ser = DisponibilidadReunionSerializer(disp, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(DisponibilidadReunionSerializer(disp).data)

    @action(detail=True, methods=["get", "post"], url_path="slots-analista")
    def slots_analista(self, request, pk=None):
        """
        GET  â€” candidato, analista y admin pueden ver los slots del analista.
        POST â€” solo analista/admin puede agregar slots.
        Body: { fecha, hora_inicio, hora_fin (opcional) }
        """
        est = self.get_object()
        rol = str(getattr(request.user, "rol", "")).upper()

        if request.method == "GET":
            if rol == "CANDIDATO" and est.solicitud.candidato.email != request.user.email:
                return Response({"detail": "Sin permiso."}, status=403)
            if rol not in {"CANDIDATO", "ANALISTA", "ADMIN"}:
                return Response({"detail": "Sin permiso."}, status=403)
            slots = SlotDisponibilidadAnalista.objects.filter(estudio=est)
            return Response(SlotDisponibilidadAnalistaSerializer(slots, many=True).data)

        if rol not in {"ANALISTA", "ADMIN"}:
            return Response({"detail": "Solo el analista puede agregar slots."}, status=403)

        ser = SlotDisponibilidadAnalistaSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(estudio=est)
        slots = SlotDisponibilidadAnalista.objects.filter(estudio=est)
        return Response(SlotDisponibilidadAnalistaSerializer(slots, many=True).data, status=201)

    @action(detail=True, methods=["delete"], url_path="slots-analista/(?P<slot_id>[0-9]+)")
    def slot_analista_delete(self, request, pk=None, slot_id=None):
        """DELETE â€” analista/admin elimina un slot especÃ­fico."""
        est = self.get_object()
        rol = str(getattr(request.user, "rol", "")).upper()
        if rol not in {"ANALISTA", "ADMIN"}:
            return Response({"detail": "Sin permiso."}, status=403)
        try:
            slot = SlotDisponibilidadAnalista.objects.get(pk=slot_id, estudio=est)
        except SlotDisponibilidadAnalista.DoesNotExist:
            return Response({"detail": "Slot no encontrado."}, status=404)
        slot.delete()
        slots = SlotDisponibilidadAnalista.objects.filter(estudio=est)
        return Response(SlotDisponibilidadAnalistaSerializer(slots, many=True).data)

    @action(detail=True, methods=["post"], url_path="seleccionar-slot")
    def seleccionar_slot(self, request, pk=None):
        """
        Candidato elige un slot del analista.
        Body: { slot_id, nota (opcional) }
        """
        est = self.get_object()
        rol = str(getattr(request.user, "rol", "")).upper()
        if rol != "CANDIDATO" or est.solicitud.candidato.email != request.user.email:
            return Response({"detail": "Solo el candidato puede seleccionar un slot."}, status=403)

        slot_id = request.data.get("slot_id")
        nota = request.data.get("nota", "")
        if not slot_id:
            return Response({"detail": "Debes indicar slot_id."}, status=400)

        try:
            slot = SlotDisponibilidadAnalista.objects.get(pk=slot_id, estudio=est)
        except SlotDisponibilidadAnalista.DoesNotExist:
            return Response({"detail": "Slot no encontrado."}, status=404)

        disp, _ = DisponibilidadReunionCandidato.objects.get_or_create(estudio=est)
        disp.slot_seleccionado = slot
        disp.fecha_propuesta = slot.fecha
        disp.hora_inicio = slot.hora_inicio
        disp.hora_fin = slot.hora_fin
        disp.nota = nota
        disp.save(update_fields=["slot_seleccionado", "fecha_propuesta", "hora_inicio", "hora_fin", "nota", "actualizada_at"])
        return Response(DisponibilidadReunionSerializer(disp).data)

    def get_queryset(self):
        user = self.request.user
        rol = getattr(user, "rol", None)
        if self.action == "list" and rol == "CLIENTE":
            qs = Estudio.objects.select_related(
                "solicitud",
                "solicitud__candidato",
                "solicitud__empresa",
                "solicitud__analista",
            )
        else:
            qs = super().get_queryset()

        if rol == "ADMIN":
            base = qs
        elif rol == "CLIENTE":
            base = qs.filter(solicitud__empresa=user.empresa)
        elif rol == "ANALISTA":
            base = qs  # Mostrar todos los estudios para analista
        elif rol == "CANDIDATO":
            base = qs.filter(solicitud__candidato__email=user.email)
        else:
            base = qs.none()

        estado_item = self.request.query_params.get("estado")
        if estado_item:
            base = base.filter(items__estado=estado_item).distinct()

        estado_estudio = self.request.query_params.get("estado_estudio")
        if estado_estudio:
            base = base.filter(estado=estado_estudio)

        desde = self.request.query_params.get("desde")
        hasta = self.request.query_params.get("hasta")
        if desde:
            base = base.filter(solicitud__created_at__date__gte=parse_date(desde))
        if hasta:
            base = base.filter(solicitud__created_at__date__lte=parse_date(hasta))

        cedula = self.request.query_params.get("cedula")
        if cedula:
            base = base.filter(solicitud__candidato__cedula__icontains=cedula)

        return base.order_by("-solicitud__created_at")

    @action(detail=True, methods=["post"])
    def observacion(self, request, pk=None):
        """ObservaciÃ³n global del estudio (analista/admin)."""
        est = self.get_object()
        if getattr(request.user, "rol", None) not in ("ANALISTA", "ADMIN"):
            return Response({"detail": "Sin permiso."}, status=403)
        denied = self._check_owner(est, request)
        if denied:
            return denied

        if (getattr(est, "estado", "") or "").upper() == "CERRADO":
            return Response({"detail": "El estudio estÃ¡ cerrado."}, status=400)

        obs = (request.data.get("observacion") or request.data.get("comentario") or "").strip()
        Estudio.objects.filter(pk=est.pk).update(observacion_analista=obs or None)
        est.observacion_analista = obs or None
        return Response({"ok": True, "observacion_analista": est.observacion_analista})

    def retrieve(self, request, *args, **kwargs):
        est = self.get_object()
        _recalcular_progreso_anexos(est)
        ser = self.get_serializer(est)
        data = ser.data

        # Ã¢Â¬â€¡Ã¯Â¸Â Si es CANDIDATO y el estudio estÃ¡ cerrado y NO ha enviado la evaluaciÃ³n
        if str(getattr(request.user, "rol", "")).upper() == "CANDIDATO":
            ev = getattr(est, "evaluacion", None)
            pendiente = ((est.estado or "").upper() == "CERRADO" and not (ev and ev.submitted_at))
            data["mostrar_evaluacion"] = bool(pendiente)

        return Response(data)

    @action(detail=True, methods=["post"])
    def decidir(self, request, pk=None):
        est = self.get_object()
        if getattr(request.user, "rol", None) not in ("ANALISTA", "ADMIN"):
            return Response({"detail": "Sin permiso."}, status=403)
        denied = self._check_owner(est, request)
        if denied:
            return denied
        if (getattr(est, "estado", "") or "").upper() == "CERRADO":
            return Response({"detail": "El estudio ya estÃ¡ cerrado."}, status=400)

        decision = (request.data.get("decision") or "").upper()
        if decision not in {"APTO", "NO_APTO"}:
            return Response({"decision": ["Debe ser APTO o NO_APTO."]}, status=400)

        obs = (request.data.get("observacion") or "").strip()
        est.decision_final = decision
        est.estado = "CERRADO"
        est.finalizado_at = timezone.now()
        if obs:
            est.observacion_analista = obs
        est.save(update_fields=["decision_final", "estado", "finalizado_at", "observacion_analista"])

        # Ã¢Â¬â€¡Ã¯Â¸Â Asegura que exista registro de evaluaciÃ³n para el candidato
        EvaluacionTrato.objects.get_or_create(
            estudio=est,
            defaults={"candidato_user": self._candidate_user_for(est)}
        )

        return Response(
            {
                "ok": True,
                "decision_final": est.decision_final,
                "estado": est.estado,
                "finalizado_at": est.finalizado_at,
                "observacion_analista": est.observacion_analista,
            }
        )


    @action(detail=True, methods=["post"])
    def enviar(self, request, pk=None):
        est = self.get_object()
        if getattr(request.user, "rol", None) != "CANDIDATO" or est.solicitud.candidato.email != request.user.email:
            return Response({"detail": "Solo el candidato puede enviar su estudio."}, status=403)
        if not est.editable_por_candidato:
            return Response({"detail": "El estudio ya fue enviado o estÃ¡ cerrado."}, status=400)

        est.marcar_enviado_por_candidato()
        return Response(EstudioSerializer(est, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def devolver(self, request, pk=None):
        est = self.get_object()
        if getattr(request.user, "rol", None) not in ("ANALISTA", "ADMIN"):
            return Response({"detail": "Sin permiso."}, status=403)

        obs = (request.data.get("observacion") or request.data.get("mensaje") or "").strip()
        if not obs:
            return Response({"observacion": ["Requerida para devolver."]}, status=400)

        est.devolver_a_candidato(obs)
        cand = est.solicitud.candidato
        if cand and cand.email:
            context = {
                "subject": f"CorrecciÃ³n requerida en estudio #{est.id}",
                "nombre": cand.nombre,
                "estudio_id": est.id,
                "observacion": obs
            }
            mensaje_html = render_to_string("emails/correccion_estudio.html", context)
            mensaje_txt = render_to_string("emails/correccion_estudio.txt", context)
            send_mail(
                subject=context["subject"],
                message=mensaje_txt,
                from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@estudio.local"),
                recipient_list=[cand.email],
                html_message=mensaje_html,
                fail_silently=True,
            )
        return Response(EstudioSerializer(est, context={"request": request}).data)

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def subir_consent_pdf(self, request, pk=None):
        est = self.get_object()
        if getattr(request.user, "rol", None) != "CANDIDATO" or est.solicitud.candidato.email != request.user.email:
            return Response({"detail": "Sin permiso."}, status=403)

        f = request.FILES.get("file")
        tipo = (request.data.get("tipo") or "CONSENT").upper()
        if not f:
            return Response({"file": ["Requerido."]}, status=400)

        doc = EstudioDocumento.objects.create(
            estudio=est, categoria=tipo, archivo=f, nombre=f.name, subido_por="CANDIDATO"
        )
        return Response(
            {
                "ok": True,
                "id": doc.id,
                "nombre": doc.nombre,
                "url": getattr(doc.archivo, "url", None),
                "categoria": doc.categoria,
            },
            status=201,
        )

    @action(detail=True, methods=["get"])
    def resumen(self, request, pk=None):
        est = self.get_object()
        _recalcular_progreso_anexos(est)

        items = est.items.all()
        total = items.count()
        validados = items.filter(estado="VALIDADO").count()
        hallazgos = items.filter(estado="HALLAZGO").count()

        # Ã¢â€â‚¬Ã¢â€â‚¬ Calcular llenado real del candidato por mÃ³dulo Ã¢â€â‚¬Ã¢â€â‚¬
        fill, progreso_candidato = _candidato_fill(est)

        secciones = {}
        for it in items:
            tipo = it.tipo
            sec = it.get_tipo_display() if hasattr(it, "get_tipo_display") else tipo
            secciones.setdefault(sec, {"estado": [], "validados": 0, "hallazgos": 0, "tipo": tipo, "fill_candidato": fill.get(tipo, None)})
            secciones[sec]["estado"].append(it.estado)
            if it.estado == "VALIDADO":
                secciones[sec]["validados"] += 1
            if it.estado == "HALLAZGO":
                secciones[sec]["hallazgos"] += 1

        consentimientos_data = [
            {
                "id": c.id,
                "tipo": c.tipo,
                "aceptado": c.aceptado,
                "firmado_at": c.firmado_at,
            }
            for c in est.consentimientos.all().order_by("tipo")
        ]

        data = {
            "estudio_id": est.id,
            "progreso": est.progreso,
            "progreso_candidato": progreso_candidato,
            "fill_candidato": fill,
            "score_cuantitativo": est.score_cuantitativo,
            "nivel_cualitativo": est.nivel_cualitativo,
            "totales": {"items": total, "validados": validados, "hallazgos": hallazgos},
            "secciones": secciones,
            "autorizacion": {
                "firmada": est.autorizacion_firmada,
                "fecha": getattr(est, "autorizacion_fecha", None),
            },
            "consentimientos": consentimientos_data,
        }
        if getattr(request.user, "rol", None) == "CANDIDATO":
            data.pop("score_cuantitativo", None)
            data.pop("nivel_cualitativo", None)
        return Response(data)

    @action(detail=True, methods=["get"])
    def resumen_pdf(self, request, pk=None):
        est = self.get_object()

        buf = BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
        w, h = A4
        y = h - 40

        # Cabecera
        c.setFont("Helvetica-Bold", 14)
        c.drawString(40, y, f"Resumen Estudio #{est.id}")
        y -= 20
        c.setFont("Helvetica", 10)
        items = est.items.all()
        total = items.count()
        validados = items.filter(estado="VALIDADO").count()
        hallazgos = items.filter(estado="HALLAZGO").count()
        c.drawString(
            40,
            y,
            f"Progreso: {int(est.progreso or 0)}%   |   Items: {total}   Validados: {validados}   Hallazgos: {hallazgos}",
        )
        y -= 20
        c.drawString(40, y, f"AutorizaciÃ³n: {'Firmada' if est.autorizacion_firmada else 'Pendiente'}")
        y -= 28

        # Documentos (links)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(40, y, "Documentos (clic para abrir)")
        y -= 18
        c.setFont("Helvetica", 10)

        docs = est.documentos.all().order_by("categoria", "-creado")
        if docs.exists():
            for d in docs:
                label = f"[{d.categoria or 'DOC'}] {d.nombre or 'archivo'}"
                url = _abs_file_url(request, d.archivo)
                c.drawString(50, y, "â€¢ ")
                if url:
                    _draw_link_text(c, 60, y, label, url)
                else:
                    c.drawString(60, y, label)
                y -= 14
                if y < 60:
                    c.showPage()
                    y = h - 40
                    c.setFont("Helvetica", 10)
        else:
            c.drawString(50, y, "â€” Sin documentos â€”")
            y -= 14

        y -= 10

        # Anexos fotogrÃ¡ficos (thumbnails con link)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(40, y, "Anexos fotogrÃ¡ficos")
        y -= 20

        anexos = AnexoFoto.objects.filter(estudio=est).order_by("orden", "tipo", "-creado")
        if anexos.exists():
            cols = 3
            gap = 8
            thumb_w = (w - 80 - gap * (cols - 1)) / cols  # mÃ¡rgenes 40/40
            thumb_h = thumb_w * 0.66
            x0 = 40
            col = 0

            for ax in anexos:
                if y - (thumb_h + 22) < 60:
                    c.showPage()
                    y = h - 60

                x = x0 + col * (thumb_w + gap)

                c.setFont("Helvetica", 8)
                c.setFillColor(colors.white)
                c.drawString(x, y, (ax.label or ax.tipo or "Anexo")[:40])

                y_img = y - 12 - thumb_h
                url = _abs_file_url(request, getattr(ax, "archivo", None))
                drawn = False

                ir = _image_reader_from_field(getattr(ax, "archivo", None))
                if ir:
                    c.drawImage(ir, x, y_img, width=thumb_w, height=thumb_h, preserveAspectRatio=True, mask="auto")
                    drawn = True

                if not drawn:
                    c.setStrokeColor(colors.white)
                    c.rect(x, y_img, thumb_w, thumb_h, stroke=1, fill=0)
                    c.setFont("Helvetica", 7)
                    c.setFillColor(colors.HexColor("#94a3b8"))
                    c.drawCentredString(x + thumb_w / 2, y_img + thumb_h / 2 - 3, "Sin imagen")

                if url:
                    c.linkURL(url, (x, y_img, x + thumb_w, y_img + thumb_h), relative=0)

                col += 1
                if col >= cols:
                    col = 0
                    y = y_img - 18
        else:
            c.setFont("Helvetica", 10)
            c.drawString(40, y, "â€” Sin anexos â€”")

        c.showPage()
        c.save()
        buf.seek(0)
        return FileResponse(buf, as_attachment=True, filename=f"resumen_estudio_{est.id}.pdf")

    @action(detail=True, methods=["post"])
    def firmar_autorizacion(self, request, pk=None):
        est = self.get_object()
        if getattr(request.user, "rol", None) != "CANDIDATO":
            return Response({"detail": "Solo el candidato puede firmar."}, status=403)
        est.autorizacion_firmada = True
        if hasattr(est, "autorizacion_fecha"):
            est.autorizacion_fecha = timezone.now()
        est.save()
        return Response({"ok": True})

    @action(detail=True, methods=["post"])
    def agregar_item(self, request, pk=None):
        if getattr(request.user, "rol", None) not in ("ANALISTA", "ADMIN"):
            return Response({"detail": "Sin permiso."}, status=403)
        est = self.get_object()
        tipo = request.data.get("tipo", ItemTipo.LISTAS_RESTRICTIVAS)
        item = EstudioItem.objects.create(estudio=est, tipo=tipo)

        prev = int(est.progreso or 0)
        est.recalcular()
        _bump_progreso(est, max(prev, int(est.progreso or 0)))
        return Response(EstudioItemSerializer(item).data, status=201)

    @action(detail=True, methods=["post"])
    def validar_masivo(self, request, pk=None):
        if getattr(request.user, "rol", None) not in ("ANALISTA", "ADMIN"):
            return Response({"detail": "Sin permiso."}, status=403)

        est = self.get_object()
        payload = request.data.get("items", [])
        updated = 0

        for it in payload:
            iid = it.get("id")
            if not iid:
                continue
            try:
                item = est.items.get(id=iid)
            except EstudioItem.DoesNotExist:
                continue

            estado = it.get("estado", "VALIDADO")
            puntaje = float(it.get("puntaje", 0) or 0)
            comentario = it.get("comentario", "")

            if estado == "HALLAZGO":
                item.estado = "HALLAZGO"
                item.puntaje = puntaje
                item.comentario = comentario
                item.save()
            else:
                item.marcar_validado(puntaje=puntaje)
                if comentario:
                    item.comentario = comentario
                    item.save()

            updated += 1

        prev = int(est.progreso or 0)
        est.recalcular()
        _bump_progreso(est, max(prev, int(est.progreso or 0)))
        return Response({"ok": True, "updated": updated})

    @action(detail=True, methods=["get"])
    def consentimientos(self, request, pk=None):
        est = self.get_object()
        data = EstudioConsentimientoSerializer(est.consentimientos.all(), many=True, context={"request": request}).data
        return Response(data)

    @action(detail=True, methods=["get"], url_path="consentimientos/pdf")
    def consentimientos_pdf(self, request, pk=None):
        est = self.get_object()
        rol = str(getattr(request.user, "rol", "")).upper()
        if rol not in {"ADMIN", "ANALISTA", "CLIENTE"}:
            return Response({"detail": "Sin permiso para descargar esta evidencia."}, status=403)

        tipo = str(request.query_params.get("tipo") or "").upper().strip()
        tipos_validos = {t.value for t in ConsentimientoTipo}
        if tipo and tipo not in tipos_validos:
            return Response({"detail": "Tipo de consentimiento invalido."}, status=400)

        qs = EstudioConsentimiento.objects.filter(estudio=est, aceptado=True)
        if tipo:
            qs = qs.filter(tipo=tipo)
        consentimientos = list(qs.order_by("tipo", "id"))
        is_draft = False
        if not consentimientos:
            if tipo:
                base_cons = EstudioConsentimiento.objects.filter(estudio=est, tipo=tipo).first()
                consentimientos = [base_cons or SimpleNamespace(
                    tipo=tipo,
                    firmado_at=None,
                    ip=None,
                    user_agent=None,
                    firma=None,
                    firma_draw=None,
                    firma_imagen=None,
                )]
                is_draft = True
            else:
                return Response({"detail": "No hay consentimientos firmados para generar PDF."}, status=404)

        empresa = getattr(getattr(est, "solicitud", None), "empresa", None)
        candidato = getattr(getattr(est, "solicitud", None), "candidato", None)
        nombre_empresa = getattr(empresa, "nombre", "") or "Empresa"
        nit_empresa = getattr(empresa, "nit", "") or "N/A"
        logo_url = getattr(empresa, "logo_url", "") or ""
        nombre_candidato = " ".join(
            [str(getattr(candidato, "nombre", "") or "").strip(), str(getattr(candidato, "apellido", "") or "").strip()]
        ).strip() or "Candidato"
        cedula = getattr(candidato, "cedula", "") or "N/A"
        email_candidato = getattr(candidato, "email", "") or "N/A"
        now_local = timezone.localtime(timezone.now())
        MESES_ES = {
            1: "enero", 2: "febrero", 3: "marzo", 4: "abril", 5: "mayo", 6: "junio",
            7: "julio", 8: "agosto", 9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre"
        }
        fecha_generado = (
            f"{now_local.day:02d} de {MESES_ES[now_local.month]} de {now_local.year} "
            f"a las {now_local.strftime('%H:%M')}"
        )
        tipo_label = dict(ConsentimientoTipo.choices)
        total_formatos = len(consentimientos)
        total_firmados = sum(1 for c in consentimientos if getattr(c, "firmado_at", None))
        total_firma_digital = sum(1 for c in consentimientos if getattr(c, "firma_draw", None))
        total_firma_imagen = sum(1 for c in consentimientos if getattr(c, "firma_imagen", None))

        # Textos legales por tipo de consentimiento
        CONSENT_TEXTS = {
            "GENERAL": (
                "El candidato autoriza a la empresa y a sus aliados a recolectar, almacenar, usar y compartir "
                "sus datos personales con fines de validaciÃ³n de identidad, verificaciÃ³n de antecedentes y "
                "evaluaciÃ³n de aptitud para el cargo, conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013."
            ),
            "CENTRALES": (
                "El candidato autoriza expresamente la consulta de su historial en centrales de riesgo "
                "(DataCrÃ©dito, TransUniÃ³n, CIFIN y similares) con el fin de evaluar su perfil financiero "
                "como parte del proceso de selecciÃ³n, segÃºn lo dispuesto en la Ley 1266 de 2008."
            ),
            "ACADEMICO": (
                "El candidato autoriza la verificaciÃ³n de sus tÃ­tulos, certificados y demÃ¡s credenciales "
                "acadÃ©micas ante las instituciones educativas correspondientes, incluyendo el contacto "
                "directo con dichas entidades para confirmar la autenticidad de la informaciÃ³n suministrada."
            ),
        }

        # Colores por tipo
        TIPO_COLORS = {
            "GENERAL":   ("#1e40af", "#dbeafe", "#eff6ff"),
            "CENTRALES": ("#065f46", "#a7f3d0", "#ecfdf5"),
            "ACADEMICO": ("#6b21a8", "#e9d5ff", "#faf5ff"),
        }

        # Paleta principal
        C_NAVY    = colors.HexColor("#0f2044")
        C_NAVY2   = colors.HexColor("#162d59")
        C_ACCENT  = colors.HexColor("#2563eb")
        C_WHITE   = colors.white
        C_LIGHT   = colors.HexColor("#f1f5f9")
        C_MUTED   = colors.HexColor("#64748b")
        C_TEXT    = colors.HexColor("#1e293b")
        C_BORDER  = colors.HexColor("#e2e8f0")
        C_GREEN   = colors.HexColor("#059669")
        C_FOOTER  = colors.HexColor("#0b1a35")

        buf = BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
        w, h = A4
        page = [1]  # mutable para closures

        def draw_page_background():
            # Fondo general blanco
            c.setFillColor(C_WHITE)
            c.rect(0, 0, w, h, stroke=0, fill=1)
            # Banda lateral izquierda decorativa
            c.setFillColor(colors.HexColor("#f8faff"))
            c.rect(0, 0, 6, h, stroke=0, fill=1)
            c.setFillColor(C_ACCENT)
            c.rect(0, 0, 3, h, stroke=0, fill=1)

        def draw_header():
            # Cabecera sÃ³lida con degradado simulado (dos rectÃ¡ngulos)
            c.setFillColor(C_NAVY)
            c.rect(0, h - 130, w, 130, stroke=0, fill=1)
            c.setFillColor(C_NAVY2)
            c.rect(0, h - 130, w, 30, stroke=0, fill=1)

            # LÃ­nea de acento bajo el header
            c.setFillColor(C_ACCENT)
            c.rect(0, h - 132, w, 3, stroke=0, fill=1)

            # Logo de empresa
            logo = _image_reader_from_logo_url(request, logo_url)
            if logo:
                c.drawImage(logo, 22, h - 118, width=72, height=62,
                            preserveAspectRatio=True, mask="auto")
                text_x = 108
            else:
                # Placeholder cuadrado si no hay logo
                c.setFillColor(C_ACCENT)
                c.roundRect(22, h - 118, 62, 62, 8, stroke=0, fill=1)
                c.setFillColor(C_WHITE)
                c.setFont("Helvetica-Bold", 20)
                c.drawCentredString(53, h - 82, nombre_empresa[:2].upper())
                text_x = 98

            # TÃ­tulo principal
            c.setFillColor(C_WHITE)
            c.setFont("Helvetica-Bold", 18)
            c.drawString(text_x, h - 46, "ACTA DE CONSENTIMIENTOS FIRMADOS")

            # SubtÃ­tulo
            c.setFont("Helvetica", 9)
            c.setFillColor(colors.HexColor("#93c5fd"))
            c.drawString(text_x, h - 62, f"Estudio #{est.id}  Â·  Generado el {fecha_generado}")
            c.drawString(text_x, h - 76, f"{nombre_empresa}  Â·  NIT: {nit_empresa}")

            # NÃºmero de pÃ¡gina (esquina superior derecha)
            c.setFont("Helvetica", 8)
            c.setFillColor(colors.HexColor("#93c5fd"))
            c.drawRightString(w - 22, h - 62, f"PÃ¡gina {page[0]}")

            # Tarjeta de datos del candidato
            c.setFillColor(colors.HexColor("#0d1f3c"))
            c.roundRect(18, h - 182, w - 36, 46, 6, stroke=0, fill=1)
            c.setStrokeColor(colors.HexColor("#1e3a5f"))
            c.roundRect(18, h - 182, w - 36, 46, 6, stroke=1, fill=0)

            # Ãcono persona (cÃ­rculo pequeÃ±o)
            c.setFillColor(C_ACCENT)
            c.circle(38, h - 159, 10, stroke=0, fill=1)
            c.setFillColor(C_WHITE)
            c.setFont("Helvetica-Bold", 9)
            c.drawCentredString(38, h - 162, "C")

            c.setFillColor(colors.HexColor("#e2e8f0"))
            c.setFont("Helvetica-Bold", 10)
            c.drawString(56, h - 152, nombre_candidato)
            c.setFont("Helvetica", 8.5)
            c.setFillColor(colors.HexColor("#94a3b8"))
            c.drawString(56, h - 167, f"C.C. {cedula}  Â·  {email_candidato}")

            # Total de formatos
            total = len(consentimientos)
            if is_draft:
                label = f"{total} formato{'s' if total != 1 else ''} en borrador"
            else:
                label = f"{total} formato{'s' if total != 1 else ''} firmado{'s' if total != 1 else ''}"
            c.setFillColor(C_GREEN)
            c.setFont("Helvetica-Bold", 8)
            c.drawRightString(w - 28, h - 152, ("Estado: BORRADOR - " if is_draft else "Estado: FIRMADO - ") + label)

        def draw_exec_summary():
            panel_x = 18
            panel_y = h - 250
            panel_w = w - 36
            panel_h = 58

            c.setFillColor(colors.HexColor("#f8fbff"))
            c.roundRect(panel_x, panel_y, panel_w, panel_h, 7, stroke=0, fill=1)
            c.setStrokeColor(colors.HexColor("#dbeafe"))
            c.setLineWidth(1)
            c.roundRect(panel_x, panel_y, panel_w, panel_h, 7, stroke=1, fill=0)

            c.setFont("Helvetica-Bold", 8)
            c.setFillColor(colors.HexColor("#1e3a8a"))
            c.drawString(panel_x + 12, panel_y + 44, "RESUMEN EJECUTIVO")

            chip_y = panel_y + 11
            chip_h = 22
            gap = 8
            chip_specs = [
                ("Formatos", f"{total_formatos}", colors.HexColor("#1d4ed8"), 88),
                ("Firmados", f"{total_firmados}", colors.HexColor("#059669"), 88),
                ("Firma digital", f"{total_firma_digital}", colors.HexColor("#7c3aed"), 108),
                ("Imagen cargada", f"{total_firma_imagen}", colors.HexColor("#0ea5e9"), 110),
            ]

            cx = panel_x + 12
            for lbl, val, col, cw in chip_specs:
                c.setFillColor(colors.HexColor("#ffffff"))
                c.roundRect(cx, chip_y, cw, chip_h, 6, stroke=0, fill=1)
                c.setStrokeColor(col)
                c.setLineWidth(0.8)
                c.roundRect(cx, chip_y, cw, chip_h, 6, stroke=1, fill=0)
                c.setFillColor(col)
                c.setFont("Helvetica-Bold", 7.5)
                c.drawString(cx + 8, chip_y + 7, f"{lbl}: {val}")
                cx += cw + gap

        def draw_footer():
            c.setFillColor(C_FOOTER)
            c.rect(0, 0, w, 40, stroke=0, fill=1)
            c.setFillColor(C_ACCENT)
            c.rect(0, 40, w, 2, stroke=0, fill=1)
            c.setFont("Helvetica", 7.5)
            c.setFillColor(colors.HexColor("#94a3b8"))
            c.drawString(22, 25, "Documento generado automÃ¡ticamente por la plataforma eConfia Â· Evidencia digital de consentimientos informados")
            c.drawRightString(w - 22, 25, f"Estudio #{est.id}  Â·  PÃ¡gina {page[0]}")
            c.drawCentredString(w / 2, 12, now_local.strftime("Emitido el %d/%m/%Y a las %H:%M hrs"))

        # Anchos de columna fijos para metadatos
        META_COL = 90  # ancho de la etiqueta en puntos

        draw_page_background()
        draw_header()
        draw_exec_summary()
        y = h - 270

        for idx, cons in enumerate(consentimientos):
            # Ã¢â€â‚¬Ã¢â€â‚¬ Pre-calcular contenido variable Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
            ua_lines    = _wrap_pdf_text(cons.user_agent or "N/A", max_len=76)[:2]
            text_lines  = _wrap_pdf_text(CONSENT_TEXTS.get(cons.tipo, ""), max_len=80)
            has_ua2     = len(ua_lines) > 1

            # Alturas de secciones (fijas)
            H_HEADER    = 32   # badges + padding top
            H_SEP1      = 8    # separador tras badges
            H_META      = 13 * 3 + (13 if has_ua2 else 0)  # 3 filas + lÃ­nea ua extra
            H_GAP1      = 10   # gap entre meta y texto legal
            H_TEXT      = len(text_lines) * 11 + 14 if text_lines else 0
            H_GAP2      = 12   # gap entre texto legal y secciÃ³n firmas
            H_SIG_HDR   = 22   # "EVIDENCIA DE FIRMAS" + separador
            H_SIG_LBL   = 14   # etiquetas sobre las cajas
            H_SIG_BOX   = 80   # altura de las cajas de firma
            H_PAD_BOT   = 16   # padding inferior

            card_h = (H_HEADER + H_SEP1 + H_META + H_GAP1
                      + H_TEXT + H_GAP2 + H_SIG_HDR
                      + H_SIG_LBL + H_SIG_BOX + H_PAD_BOT)

            if y - card_h < 55:
                draw_footer()
                c.showPage()
                page[0] += 1
                draw_page_background()
                draw_header()
                draw_exec_summary()
                y = h - 270

            accent_hex, border_hex, bg_hex = TIPO_COLORS.get(cons.tipo, ("#1e40af", "#dbeafe", "#eff6ff"))
            C_CARD_ACCENT = colors.HexColor(accent_hex)
            C_CARD_BORDER = colors.HexColor(border_hex)
            C_CARD_BG     = colors.HexColor(bg_hex)

            card_top = y
            card_bot = y - card_h

            # Ã¢â€â‚¬Ã¢â€â‚¬ Fondo y marco de tarjeta Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
            c.setFillColor(colors.HexColor("#d1d5db"))   # sombra
            c.roundRect(21, card_bot - 3, w - 40, card_h, 8, stroke=0, fill=1)
            c.setFillColor(C_CARD_BG)
            c.roundRect(18, card_bot, w - 36, card_h, 8, stroke=0, fill=1)
            c.setStrokeColor(C_CARD_BORDER)
            c.setLineWidth(1)
            c.roundRect(18, card_bot, w - 36, card_h, 8, stroke=1, fill=0)
            c.setFillColor(C_CARD_ACCENT)               # barra lateral
            c.roundRect(18, card_bot, 5, card_h, 4, stroke=0, fill=1)

            # Ã¢â€â‚¬Ã¢â€â‚¬ Badges Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
            cy = card_top - 8   # cursor y (texto en baseline)
            tipo_txt = tipo_label.get(cons.tipo, cons.tipo).upper()
            badge_w = len(tipo_txt) * 5.2 + 16
            c.setFillColor(C_CARD_ACCENT)
            c.roundRect(32, cy - 14, badge_w, 16, 8, stroke=0, fill=1)
            c.setFillColor(C_WHITE)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(40, cy - 5, tipo_txt)
            status_color = colors.HexColor("#94a3b8") if is_draft else C_GREEN
            c.setFillColor(status_color)
            c.roundRect(32 + badge_w + 8, cy - 14, 82, 16, 8, stroke=0, fill=1)
            c.setFillColor(C_WHITE)
            c.setFont("Helvetica-Bold", 7)
            c.drawString(32 + badge_w + 17, cy - 5, "BORRADOR" if is_draft else "FIRMADO")

            c.setFont("Helvetica", 8)
            c.setFillColor(C_MUTED)
            c.drawRightString(w - 28, cy - 5, f"#{idx + 1} de {len(consentimientos)}")

            # Ã¢â€â‚¬Ã¢â€â‚¬ Separador Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
            cy -= H_HEADER
            c.setStrokeColor(C_CARD_BORDER)
            c.setLineWidth(0.5)
            c.line(28, cy, w - 28, cy)
            cy -= H_SEP1

            # Ã¢â€â‚¬Ã¢â€â‚¬ Metadatos Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
            firmado_str = (
                timezone.localtime(cons.firmado_at).strftime("%d/%m/%Y  %H:%M")
                if cons.firmado_at else "N/A"
            )

            def meta_row(lbl, val, ry):
                c.setFont("Helvetica-Bold", 8)
                c.setFillColor(C_MUTED)
                c.drawString(32, ry, lbl)
                c.setFont("Helvetica", 8)
                c.setFillColor(C_TEXT)
                c.drawString(32 + META_COL, ry, val)

            meta_row("Fecha de firma:", firmado_str, cy)
            cy -= 13
            meta_row("IP registrada:", cons.ip or "N/A", cy)
            cy -= 13
            meta_row("Dispositivo:", ua_lines[0] if ua_lines else "N/A", cy)
            cy -= 13
            if has_ua2:
                c.setFont("Helvetica-Oblique", 7)
                c.setFillColor(C_MUTED)
                c.drawString(32 + META_COL, cy, ua_lines[1])
                cy -= 13

            cy -= H_GAP1

            # Ã¢â€â‚¬Ã¢â€â‚¬ Bloque de texto legal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
            if text_lines:
                block_h = H_TEXT
                block_y = cy - block_h
                c.setFillColor(colors.HexColor("#f0f4ff"))
                c.roundRect(28, block_y, w - 56, block_h, 4, stroke=0, fill=1)
                c.setStrokeColor(C_CARD_BORDER)
                c.roundRect(28, block_y, w - 56, block_h, 4, stroke=1, fill=0)
                c.setFillColor(C_CARD_ACCENT)
                c.rect(28, block_y, 3, block_h, stroke=0, fill=1)
                c.setFont("Helvetica-Oblique", 7.5)
                c.setFillColor(colors.HexColor("#374151"))
                line_y = cy - 8
                for line in text_lines:
                    c.drawString(36, line_y, line)
                    line_y -= 11
                cy -= block_h

            cy -= H_GAP2

            # Ã¢â€â‚¬Ã¢â€â‚¬ Encabezado secciÃ³n firmas Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
            c.setFont("Helvetica-Bold", 8)
            c.setFillColor(C_MUTED)
            c.drawString(32, cy, "EVIDENCIA DE FIRMAS")
            cy -= 6
            c.setStrokeColor(C_CARD_BORDER)
            c.setLineWidth(0.5)
            c.line(32, cy, w - 28, cy)
            cy -= (H_SIG_HDR - 6)

            # Ã¢â€â‚¬Ã¢â€â‚¬ Cajas de firma Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
            sig_box_w = (w - 80) / 2
            sig_box_y = cy - H_SIG_BOX   # bottom-left de las cajas

            # Etiquetas ENCIMA de las cajas
            c.setFont("Helvetica-Bold", 7.5)
            c.setFillColor(C_CARD_ACCENT)
            c.drawString(32, cy - 3, "FIRMA DIGITAL")
            c.drawString(32 + sig_box_w + 16, cy - 3, "IMAGEN SUBIDA POR EL CANDIDATO")
            cy -= H_SIG_LBL

            # Cajas de firma
            sig_gap   = 14
            sig_box_w = (w - 80 - sig_gap) / 2
            sig_box_y = cy - H_SIG_BOX

            # Caja izquierda â€” solo trazo digital
            c.setFillColor(C_WHITE)
            c.roundRect(32, sig_box_y, sig_box_w, H_SIG_BOX, 5, stroke=0, fill=1)
            c.setStrokeColor(C_CARD_ACCENT)
            c.setLineWidth(1)
            c.roundRect(32, sig_box_y, sig_box_w, H_SIG_BOX, 5, stroke=1, fill=0)
            c.setLineWidth(0.5)
            sig_draw = _image_reader_from_field(getattr(cons, "firma_draw", None))
            if sig_draw:
                c.drawImage(sig_draw, 38, sig_box_y + 6, width=sig_box_w - 12,
                            height=H_SIG_BOX - 12, preserveAspectRatio=True, mask="auto")
            else:
                c.setFont("Helvetica-Oblique", 7.5)
                c.setFillColor(colors.HexColor("#9ca3af"))
                c.drawCentredString(32 + sig_box_w / 2, sig_box_y + H_SIG_BOX / 2 - 4,
                                    "Sin firma digital registrada")

            # Caja derecha â€” imagen subida
            sig2_x = 32 + sig_box_w + sig_gap
            c.setFillColor(C_WHITE)
            c.roundRect(sig2_x, sig_box_y, sig_box_w, H_SIG_BOX, 5, stroke=0, fill=1)
            c.setStrokeColor(C_CARD_BORDER)
            c.roundRect(sig2_x, sig_box_y, sig_box_w, H_SIG_BOX, 5, stroke=1, fill=0)
            sig2 = _image_reader_from_field(getattr(cons, "firma_imagen", None))
            if sig2:
                c.drawImage(sig2, sig2_x + 6, sig_box_y + 6, width=sig_box_w - 12,
                            height=H_SIG_BOX - 12, preserveAspectRatio=True, mask="auto")
            else:
                c.setFont("Helvetica-Oblique", 7.5)
                c.setFillColor(colors.HexColor("#9ca3af"))
                c.drawCentredString(sig2_x + sig_box_w / 2, sig_box_y + H_SIG_BOX / 2 - 4,
                                    "Sin imagen subida")

            y = card_bot - 18

        draw_footer()
        c.save()
        buf.seek(0)
        tipo_suffix = f"_{tipo.lower()}" if tipo else ""
        return FileResponse(
            buf,
            as_attachment=True,
            filename=f"acta_consentimientos_estudio_{est.id}{tipo_suffix}.pdf",
        )

    @action(detail=True, methods=["post"], url_path="resetear_consentimientos")
    def resetear_consentimientos(self, request, pk=None):
        """Analista/Admin reinicia los consentimientos para que el candidato vuelva a firmar."""
        est = self.get_object()
        rol = str(getattr(request.user, "rol", "")).upper()
        if rol not in {"ADMIN", "ANALISTA"}:
            return Response({"detail": "Sin permiso."}, status=403)

        updated = (
            EstudioConsentimiento.objects
            .filter(estudio=est)
            .update(
                aceptado=False,
                firmado_at=None,
                ip=None,
                user_agent=None,
                firma=None,
                firma_draw=None,
                firma_imagen=None,
            )
        )
        est.autorizacion_firmada = False
        if hasattr(est, "autorizacion_fecha"):
            est.autorizacion_fecha = None
            est.save(update_fields=["autorizacion_firmada", "autorizacion_fecha"])
        else:
            est.save(update_fields=["autorizacion_firmada"])

        return Response({"detail": f"{updated} consentimiento(s) reiniciado(s). El candidato debera volver a firmar."})

    @action(detail=True, methods=["post"])
    def firmar_consentimiento(self, request, pk=None):
        est = self.get_object()
        if getattr(request.user, "rol", None) != "CANDIDATO" or est.solicitud.candidato.email != request.user.email:
            return Response({"detail": "Sin permiso."}, status=403)

        tipo = request.data.get("tipo")
        acepta_raw = request.data.get("acepta")
        acepta = str(acepta_raw).lower() in {"1", "true", "t", "yes", "y"}

        draw_b64 = (
            request.data.get("firma_draw_base64")
            or request.data.get("firma_base64")
            or request.data.get("firma_draw_b64")
        )
        upload_b64 = (
            request.data.get("firma_upload_base64")
            or request.data.get("firma_imagen_base64")
            or request.data.get("firma_upload_b64")
            or request.data.get("firma_imagen_b64")
        )

        ua = request.data.get("user_agent", "")
        ip = (request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or request.META.get("REMOTE_ADDR"))

        if tipo not in {t.value for t in ConsentimientoTipo}:
            return Response({"detail": "Tipo invÃ¡lido."}, status=400)

        cons = EstudioConsentimiento.objects.filter(estudio=est, tipo=tipo).first()
        if not cons:
            return Response({"detail": "Consentimiento no encontrado."}, status=404)

        if acepta:
            if not (isinstance(draw_b64, str) and draw_b64.startswith("data:image")):
                return Response({"detail": "Debes dibujar tu firma para continuar."}, status=400)
            if not (isinstance(upload_b64, str) and upload_b64.startswith("data:image")):
                return Response({"detail": "Debes subir la imagen de tu firma para continuar."}, status=400)

            cf_comb = _stack_two_signatures(draw_b64, upload_b64) or _dataurl_to_contentfile(
                upload_b64, f"firma_{est.id}_{tipo}.png"
            )
            if not cf_comb:
                return Response({"detail": "No se pudo procesar la firma."}, status=400)

            cons.firma.save(f"firma_{est.id}_{tipo}.png", cf_comb, save=False)

            # Guardar trazo digital por separado
            cf_draw = _dataurl_to_contentfile(draw_b64, f"firma_{est.id}_{tipo}_draw.png")
            if cf_draw and hasattr(cons, "firma_draw"):
                cons.firma_draw.save(f"firma_{est.id}_{tipo}_draw.png", cf_draw, save=False)

            cf_up = _dataurl_to_contentfile(upload_b64, f"firma_{est.id}_{tipo}_upload.png")
            if cf_up and hasattr(cons, "firma_imagen"):
                cons.firma_imagen.save(f"firma_{est.id}_{tipo}_upload.png", cf_up, save=False)

            cons.aceptado = True
            cons.firmado_at = timezone.now()
            cons.user_agent = ua or None
            cons.ip = ip or None

            fields = ["firma", "aceptado", "firmado_at", "user_agent", "ip"]
            if hasattr(cons, "firma_imagen"):
                fields.insert(1, "firma_imagen")
            if hasattr(cons, "firma_draw"):
                fields.insert(1, "firma_draw")
            cons.save(update_fields=fields)

            total = est.consentimientos.count()
            ok = est.consentimientos.filter(aceptado=True).count()
            if total and ok == total:
                est.autorizacion_firmada = True
                if hasattr(est, "autorizacion_fecha"):
                    est.autorizacion_fecha = timezone.now()
                est.save(
                    update_fields=["autorizacion_firmada", "autorizacion_fecha"]
                    if hasattr(est, "autorizacion_fecha")
                    else ["autorizacion_firmada"]
                )
            return Response({"ok": True})

        # desacepta
        if cons.firma:
            cons.firma.delete(save=False)
        if getattr(cons, "firma_imagen", None):
            cons.firma_imagen.delete(save=False)

        cons.firma = None
        if hasattr(cons, "firma_imagen"):
            cons.firma_imagen = None
        cons.aceptado = False
        cons.firmado_at = None
        cons.user_agent = ua or None
        cons.ip = ip or None

        fields = ["firma", "aceptado", "firmado_at", "user_agent", "ip"]
        if hasattr(cons, "firma_imagen"):
            fields.insert(1, "firma_imagen")
        cons.save(update_fields=fields)

        est.autorizacion_firmada = False
        if hasattr(est, "autorizacion_fecha"):
            est.autorizacion_fecha = None
        est.save(update_fields=["autorizacion_firmada", "autorizacion_fecha"] if hasattr(est, "autorizacion_fecha") else ["autorizacion_firmada"])
        return Response({"ok": True})

    @action(detail=True, methods=["post"])
    def set_progress(self, request, pk=None):
        est = self.get_object()
        if getattr(request.user, "rol", None) not in ("CANDIDATO", "ANALISTA", "ADMIN"):
            return Response({"detail": "Sin permiso."}, status=403)
        try:
            pct = float(request.data.get("progreso"))
        except (TypeError, ValueError):
            return Response({"progreso": ["Debe ser un nÃºmero."]}, status=400)

        _bump_progreso(est, pct)
        return Response({"ok": True, "progreso": est.progreso})

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def centrales_upload(self, request, pk=None):
        if getattr(request.user, "rol", None) not in ("ANALISTA", "ADMIN"):
            return Response({"detail": "Sin permiso."}, status=403)

        est = self.get_object()

        files = request.FILES.getlist("files") or request.FILES.getlist("file")
        if not files:
            return Response({"detail": "Adjunta al menos un archivo en 'files'."}, status=400)

        tipo_centrales = getattr(ItemTipo, "CENTRALES", ItemTipo.LISTAS_RESTRICTIVAS)
        item, _ = EstudioItem.objects.get_or_create(estudio=est, tipo=tipo_centrales, defaults={"estado": "PENDIENTE"})
        if item.estado == "PENDIENTE":
            item.estado = "EN_VALIDACION"
            item.save(update_fields=["estado"])

        creados = []
        for f in files:
            doc = EstudioDocumento.objects.create(
                estudio=est, categoria="CENTRALES", archivo=f, nombre=f.name, subido_por="ANALISTA"
            )
            creados.append(
                {"id": doc.id, "nombre": doc.nombre, "url": getattr(doc.archivo, "url", None), "categoria": doc.categoria}
            )

        prev = int(est.progreso or 0)
        est.recalcular()
        _bump_progreso(est, max(prev, int(est.progreso or 0)))
        _recalcular_progreso_anexos(est)
        return Response({"ok": True, "archivos": creados}, status=201)

    @action(detail=True, methods=["get"])
    def documentos(self, request, pk=None):
        est = self.get_object()
        cat = (request.query_params.get("categoria") or "").upper() or None
        qs = est.documentos.all().order_by("-creado")
        if cat in {"DOC", "CENTRALES"}:
            qs = qs.filter(categoria=cat)
        data = [
            {
                "id": d.id,
                "nombre": d.nombre,
                "url": getattr(d.archivo, "url", None),
                "categoria": d.categoria,
                "subido_por": d.subido_por,
                "creado": d.creado,
            }
            for d in qs
        ]
        return Response(data)

    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # Nuevo sistema de agendamiento tipo cita mÃ©dica
    # â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @action(detail=True, methods=["get"], url_path="reunion-agendada/slots-disponibles")
    def reunion_slots_disponibles(self, request, pk=None):
        """
        GET â€” candidato/analista/admin ve los slots disponibles del analista
        asignado al estudio, dentro del plazo de 3 dÃ­as hÃ¡biles desde enviado_at.
        """
        est = self.get_object()
        rol = str(getattr(request.user, "rol", "")).upper()

        if rol == "CANDIDATO" and est.solicitud.candidato.email != request.user.email:
            return Response({"detail": "Sin permiso."}, status=403)
        if rol not in {"CANDIDATO", "ANALISTA", "ADMIN"}:
            return Response({"detail": "Sin permiso."}, status=403)

        fecha_inicio = est.fecha_inicio_agendamiento()
        if not fecha_inicio:
            return Response({"slots": [], "fecha_limite": None,
                             "mensaje": "El estudio aÃºn no ha sido habilitado al candidato."})

        fecha_limite = calcular_fecha_limite(fecha_inicio)
        hoy = timezone.now().date()

        if hoy > fecha_limite:
            return Response({
                "slots": [],
                "fecha_limite": fecha_limite.isoformat(),
                "vencido": True,
                "mensaje": "El plazo para agendar la reuniÃ³n virtual ha vencido.",
            })

        analista = est.solicitud.analista
        if not analista:
            return Response({"slots": [], "fecha_limite": fecha_limite.isoformat(),
                             "mensaje": "El estudio no tiene analista asignado."})

        slots = DisponibilidadAnalista.objects.filter(
            analista=analista,
            estado=DisponibilidadAnalistaEstado.DISPONIBLE,
            fecha__gte=hoy,
            fecha__lte=fecha_limite,
        )
        return Response({
            "slots": DisponibilidadAnalistaSerializer(slots, many=True).data,
            "fecha_limite": fecha_limite.isoformat(),
            "vencido": False,
        })

    @action(detail=True, methods=["get"], url_path="reunion-agendada")
    def reunion_agendada_detail(self, request, pk=None):
        """GET â€” ver la reuniÃ³n agendada del estudio."""
        est = self.get_object()
        rol = str(getattr(request.user, "rol", "")).upper()

        if rol == "CANDIDATO" and est.solicitud.candidato.email != request.user.email:
            return Response({"detail": "Sin permiso."}, status=403)
        if rol not in {"CANDIDATO", "ANALISTA", "ADMIN"}:
            return Response({"detail": "Sin permiso."}, status=403)

        reunion = getattr(est, "reunion_agendada", None)
        fecha_limite = (
            calcular_fecha_limite(est.fecha_inicio_agendamiento()).isoformat()
            if est.fecha_inicio_agendamiento() else None
        )
        if not reunion:
            return Response({"reunion": None, "fecha_limite": fecha_limite})

        data = ReunionVirtualAgendadaSerializer(reunion).data
        data["fecha_limite"] = fecha_limite
        return Response(data)

    @action(detail=True, methods=["post"], url_path="reunion-agendada/agendar")
    def reunion_agendar(self, request, pk=None):
        """
        POST â€” candidato agenda un slot del analista.
        Body: { slot_id, nota (opcional) }
        """
        est = self.get_object()
        rol = str(getattr(request.user, "rol", "")).upper()

        if rol != "CANDIDATO" or est.solicitud.candidato.email != request.user.email:
            return Response({"detail": "Solo el candidato puede agendar la reuniÃ³n."}, status=403)

        # Verificar si ya tiene reuniÃ³n activa
        reunion_existente = getattr(est, "reunion_agendada", None)
        if reunion_existente and reunion_existente.estado in ("PENDIENTE", "CONFIRMADA"):
            return Response({"detail": "Ya tienes una reuniÃ³n agendada. CancÃ©lala primero."}, status=400)

        fecha_inicio = est.fecha_inicio_agendamiento()
        if not fecha_inicio:
            return Response({"detail": "El estudio aÃºn no ha sido habilitado al candidato."}, status=400)

        fecha_limite = calcular_fecha_limite(fecha_inicio)
        hoy = timezone.now().date()

        if hoy > fecha_limite:
            return Response({"detail": "El plazo para agendar la reuniÃ³n ha vencido."}, status=400)

        slot_id = request.data.get("slot_id")
        nota = (request.data.get("nota") or "").strip()
        if not slot_id:
            return Response({"detail": "Debes indicar slot_id."}, status=400)

        with transaction.atomic():
            try:
                slot = DisponibilidadAnalista.objects.select_for_update().get(
                    pk=slot_id,
                    analista=est.solicitud.analista,
                    estado=DisponibilidadAnalistaEstado.DISPONIBLE,
                    fecha__gte=hoy,
                    fecha__lte=fecha_limite,
                )
            except DisponibilidadAnalista.DoesNotExist:
                return Response({"detail": "Slot no disponible o no encontrado."}, status=404)

            # Marcar slot como reservado
            slot.estado = DisponibilidadAnalistaEstado.RESERVADO
            slot.estudio_reservado = est
            slot.save(update_fields=["estado", "estudio_reservado"])

            if reunion_existente:
                # Liberar el slot anterior si existÃ­a
                slot_anterior = reunion_existente.slot
                if slot_anterior and slot_anterior.pk != slot.pk:
                    slot_anterior.estado = DisponibilidadAnalistaEstado.DISPONIBLE
                    slot_anterior.estudio_reservado = None
                    slot_anterior.save(update_fields=["estado", "estudio_reservado"])
                reunion_existente.slot = slot
                reunion_existente.estado = ReunionVirtualAgendada.Estado.PENDIENTE
                reunion_existente.fecha_limite_agendamiento = fecha_limite
                reunion_existente.nota = nota
                reunion_existente.cancelado_at = None
                reunion_existente.cancelado_por = None
                reunion_existente.save()
                reunion = reunion_existente
            else:
                reunion = ReunionVirtualAgendada.objects.create(
                    estudio=est,
                    slot=slot,
                    estado=ReunionVirtualAgendada.Estado.PENDIENTE,
                    fecha_limite_agendamiento=fecha_limite,
                    nota=nota,
                )

        data = ReunionVirtualAgendadaSerializer(reunion).data
        data["fecha_limite"] = fecha_limite.isoformat()
        transaction.on_commit(
            lambda estudio_id=est.id, reunion_id=reunion.id, actor_id=request.user.id: _enviar_correos_reunion_virtual(
                estudio=Estudio.objects.select_related("solicitud", "solicitud__candidato", "solicitud__analista", "solicitud__empresa").get(pk=estudio_id),
                evento="APARTADA",
                reunion=(rv := ReunionVirtualAgendada.objects.select_related("slot").get(pk=reunion_id)),
                slot=rv.slot,
                actor=get_user_model().objects.get(pk=actor_id),
            )
        )
        return Response(data, status=201)

    @action(detail=True, methods=["post"], url_path="reunion-agendada/cancelar")
    def reunion_cancelar(self, request, pk=None):
        """POST â€” candidato o analista/admin cancela la reuniÃ³n agendada."""
        est = self.get_object()
        rol = str(getattr(request.user, "rol", "")).upper()

        if rol == "CANDIDATO" and est.solicitud.candidato.email != request.user.email:
            return Response({"detail": "Sin permiso."}, status=403)
        if rol not in {"CANDIDATO", "ANALISTA", "ADMIN"}:
            return Response({"detail": "Sin permiso."}, status=403)

        reunion = getattr(est, "reunion_agendada", None)
        if not reunion or reunion.estado not in ("PENDIENTE", "CONFIRMADA"):
            return Response({"detail": "No hay reuniÃ³n activa para cancelar."}, status=404)

        with transaction.atomic():
            slot = reunion.slot
            slot.estado = DisponibilidadAnalistaEstado.DISPONIBLE
            slot.estudio_reservado = None
            slot.save(update_fields=["estado", "estudio_reservado"])

            reunion.estado = ReunionVirtualAgendada.Estado.CANCELADA
            reunion.cancelado_at = timezone.now()
            reunion.cancelado_por = request.user
            reunion.save(update_fields=["estado", "cancelado_at", "cancelado_por"])

        transaction.on_commit(
            lambda estudio_id=est.id, reunion_id=reunion.id, actor_id=request.user.id: _enviar_correos_reunion_virtual(
                estudio=Estudio.objects.select_related("solicitud", "solicitud__candidato", "solicitud__analista", "solicitud__empresa").get(pk=estudio_id),
                evento="CANCELADA",
                reunion=(rv := ReunionVirtualAgendada.objects.select_related("slot").get(pk=reunion_id)),
                slot=rv.slot,
                actor=get_user_model().objects.get(pk=actor_id),
            )
        )

        return Response({"detail": "ReuniÃ³n cancelada. El horario queda disponible para otros candidatos."})


# ======================================================================================
# Items
# ======================================================================================
class EstudioItemViewSet(viewsets.ModelViewSet):
    queryset = EstudioItem.objects.all()
    serializer_class = EstudioItemSerializer


    def get_queryset(self):
        user = self.request.user
        qs = (
            super()
            .get_queryset()
            .select_related(
                "estudio",
                "estudio__solicitud",
                "estudio__solicitud__candidato",
                "estudio__solicitud__empresa",
                "estudio__solicitud__analista",
            )
        )
        rol = getattr(user, "rol", None)
        if rol == "ADMIN":
            return qs
        if rol == "CLIENTE":
            return qs.filter(estudio__solicitud__empresa=user.empresa)
        if rol == "ANALISTA":
            return qs.filter(estudio__solicitud__analista=user)
        if rol == "CANDIDATO":
            return qs.filter(estudio__solicitud__candidato__email=user.email)
        return qs.none()

    @action(detail=True, methods=["post"])
    def validar(self, request, pk=None):
        if getattr(request.user, "rol", None) not in ("ANALISTA", "ADMIN"):
            return Response({"detail": "Sin permiso."}, status=403)
        item = self.get_object()
        if (item.estudio.estado or "").upper() == "CERRADO":
            return Response({"detail": "El estudio estÃ¡ cerrado."}, status=400)

        comentario = (request.data.get("comentario") or "").strip()
        if comentario:
            item.comentario = comentario
            item.save(update_fields=["comentario"])
        item.marcar_validado(puntaje=0)
        return Response({"ok": True})

    @action(detail=True, methods=["post"])
    def reportar(self, request, pk=None):
        """Guarda irregularidad/nota en el Ã­tem (no cambia el estado)."""
        if getattr(request.user, "rol", None) not in ("ANALISTA", "ADMIN"):
            return Response({"detail": "Sin permiso."}, status=403)

        item = self.get_object()
        if (item.estudio.estado or "").upper() == "CERRADO":
            return Response({"detail": "El estudio estÃ¡ cerrado."}, status=400)

        nota = (request.data.get("comentario") or request.data.get("motivo") or request.data.get("note") or "").strip()
        if not nota:
            return Response({"detail": "comentario requerido"}, status=400)

        # Usa el/los campos que tengas disponibles
        if hasattr(item, "irregularidad"):
            item.irregularidad = nota
        if hasattr(item, "comentario_analista"):
            item.comentario_analista = nota
        elif hasattr(item, "comentario"):
            item.comentario = nota
        item.save()
        return Response({"ok": True, "item_id": item.id})


# ======================================================================================
# Mixins/Utilidades de rol
# ======================================================================================
class BaseRolMixin:
    def filtrar_por_rol(self, qs):
        user = self.request.user
        rol = getattr(user, "rol", None)

        if rol == "ADMIN":
            return qs
        if rol == "CLIENTE":
            return qs.filter(estudio__solicitud__empresa=user.empresa)
        if rol == "ANALISTA":
            return qs.filter(estudio__solicitud__analista=user)
        if rol == "CANDIDATO":
            return qs.filter(estudio__solicitud__candidato__email=user.email)
        return qs.none()

    def validar_acceso_a_estudio(self, est: Estudio):
        user = self.request.user
        rol = getattr(user, "rol", None)

        if rol == "ADMIN":
            return
        if rol == "CLIENTE" and est.solicitud.empresa == getattr(user, "empresa", None):
            return
        if rol == "ANALISTA" and est.solicitud.analista_id == getattr(user, "id", None):
            return
        if rol == "CANDIDATO" and est.solicitud.candidato.email == user.email:
            return
        raise ValidationError({"detail": ["No autorizado para este estudio."]})


# ======================================================================================
# EconÃ³mica
# ======================================================================================
class EconomicaViewSet(BaseRolMixin, viewsets.ModelViewSet):
    queryset = Economica.objects.select_related(
        "estudio",
        "estudio__solicitud",
        "estudio__solicitud__candidato",
        "estudio__solicitud__empresa",
        "estudio__solicitud__analista",
    )
    serializer_class = EconomicaSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_queryset(self):
        qs = self.filtrar_por_rol(super().get_queryset())
        est_id = self.request.query_params.get("estudio")
        return qs.filter(estudio_id=est_id) if est_id else qs

    def _bloqueo_si_no_editable(self, est: Estudio):
        if getattr(self.request.user, "rol", None) == "CANDIDATO" and not est.editable_por_candidato:
            raise ValidationError({"detail": ["El estudio estÃ¡ bloqueado; no puedes editar."]})

    def perform_create(self, serializer):
        est_id = self.request.data.get("estudio") or self.request.query_params.get("estudio")
        if not est_id:
            if getattr(self.request.user, "rol", None) == "CANDIDATO":
                est = (
                    Estudio.objects.filter(solicitud__candidato__email=self.request.user.email)
                    .order_by("-solicitud__created_at")
                    .first()
                )
            else:
                est = None
        else:
            est = Estudio.objects.filter(pk=est_id).first()
        if not est:
            raise ValidationError({"estudio": ["Requerido."]})

        self.validar_acceso_a_estudio(est)
        self._bloqueo_si_no_editable(est)

        obj = serializer.save(estudio=est, candidato=est.solicitud.candidato)

        _ensure_item_modulo(est, getattr(ItemTipo, "INFO_ECONOMICA", getattr(ItemTipo, "ECONOMICA", "ECONOMICA")))
        prev = int(est.progreso or 0)
        est.recalcular()
        _bump_progreso(est, max(prev, int(est.progreso or 0)))
        return obj

    def perform_update(self, serializer):
        inst = serializer.instance
        self.validar_acceso_a_estudio(inst.estudio)
        self._bloqueo_si_no_editable(inst.estudio)
        serializer.save(estudio=inst.estudio, candidato=inst.candidato)

        _ensure_item_modulo(inst.estudio, getattr(ItemTipo, "INFO_ECONOMICA", "ECONOMICA"))
        prev = int(inst.estudio.progreso or 0)
        inst.estudio.recalcular()
        _bump_progreso(inst.estudio, max(prev, int(inst.estudio.progreso or 0)))

    def perform_destroy(self, instance):
        est = instance.estudio
        self.validar_acceso_a_estudio(est)
        self._bloqueo_si_no_editable(est)
        super().perform_destroy(instance)

        _ensure_item_modulo(est, getattr(ItemTipo, "INFO_ECONOMICA", "ECONOMICA"))
        prev = int(est.progreso or 0)
        est.recalcular()
        _bump_progreso(est, max(prev, int(est.progreso or 0)))


# ======================================================================================
# Anexos FotogrÃ¡ficos
# ======================================================================================
class AnexoFotoViewSet(BaseRolMixin, viewsets.ModelViewSet):
    queryset = AnexoFoto.objects.select_related(
        "estudio",
        "estudio__solicitud",
        "estudio__solicitud__candidato",
        "estudio__solicitud__empresa",
        "estudio__solicitud__analista",
    )
    serializer_class = AnexoFotoSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_queryset(self):
        qs = self.filtrar_por_rol(super().get_queryset())
        est_id = self.request.query_params.get("estudio")
        if est_id:
            qs = qs.filter(estudio_id=est_id)
        tipo = self.request.query_params.get("tipo")
        if tipo:
            qs = qs.filter(tipo=tipo)
        return qs.order_by("orden", "tipo", "-creado")

    def _bloqueo_si_no_editable(self, est: Estudio):
        if getattr(self.request.user, "rol", None) == "CANDIDATO" and not est.editable_por_candidato:
            raise ValidationError({"detail": ["El estudio estÃ¡ bloqueado; no puedes editar."]})

    def perform_create(self, serializer):
        est_id = self.request.data.get("estudio") or self.request.query_params.get("estudio")
        if not est_id:
            raise ValidationError({"estudio": ["Requerido."]})
        est = Estudio.objects.filter(pk=est_id).first()
        if not est:
            raise ValidationError({"estudio": ["No existe."]})

        self.validar_acceso_a_estudio(est)
        self._bloqueo_si_no_editable(est)

        obj = serializer.save(estudio=est, candidato=est.solicitud.candidato)

        _ensure_item_modulo(est, getattr(ItemTipo, "VISITA_DOMICILIARIA", "VISITA_DOMICILIARIA"))
        prev = int(est.progreso or 0)
        est.recalcular()
        _bump_progreso(est, max(prev, int(est.progreso or 0)))
        _recalcular_progreso_anexos(est)
        return obj

    def perform_update(self, serializer):
        inst = serializer.instance
        self.validar_acceso_a_estudio(inst.estudio)
        self._bloqueo_si_no_editable(inst.estudio)

        serializer.save(estudio=inst.estudio, candidato=inst.candidato)

        _ensure_item_modulo(inst.estudio, getattr(ItemTipo, "VISITA_DOMICILIARIA", "VISITA_DOMICILIARIA"))
        prev = int(inst.estudio.progreso or 0)
        inst.estudio.recalcular()
        _bump_progreso(inst.estudio, max(prev, int(inst.estudio.progreso or 0)))
        _recalcular_progreso_anexos(inst.estudio)

    def perform_destroy(self, instance):
        est = instance.estudio
        self.validar_acceso_a_estudio(est)
        self._bloqueo_si_no_editable(est)
        super().perform_destroy(instance)

        _ensure_item_modulo(est, getattr(ItemTipo, "VISITA_DOMICILIARIA", "VISITA_DOMICILIARIA"))
        prev = int(est.progreso or 0)
        est.recalcular()
        _bump_progreso(est, max(prev, int(est.progreso or 0)))
        _recalcular_progreso_anexos(est)


# ======================================================================================
# AcadÃ©mico
# ======================================================================================
class AcademicoViewSet(BaseRolMixin, viewsets.ModelViewSet):
    serializer_class = AcademicoSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    queryset = Academico.objects.select_related(
        "estudio",
        "estudio__solicitud",
        "estudio__solicitud__candidato",
        "estudio__solicitud__empresa",
        "estudio__solicitud__analista",
    )

    def get_queryset(self):
        return self.filtrar_por_rol(super().get_queryset())

    def get_object(self):
        obj = (
            Academico.objects.select_related("estudio", "estudio__solicitud", "estudio__solicitud__candidato").get(
                pk=self.kwargs["pk"]
            )
        )
        self.validar_acceso_a_estudio(obj.estudio)
        return obj

    def _bloqueo_si_no_editable(self, est: Estudio):
        if getattr(self.request.user, "rol", None) == "CANDIDATO" and not est.editable_por_candidato:
            raise ValidationError({"detail": ["El estudio estÃ¡ bloqueado; no puedes editar."]})

    def perform_create(self, serializer):
        est_id = self.request.data.get("estudio") or self.request.query_params.get("estudio")
        est = None
        if est_id:
            try:
                est = Estudio.objects.get(pk=est_id)
            except Estudio.DoesNotExist:
                raise ValidationError({"estudio": ["No existe."]})
        else:
            if getattr(self.request.user, "rol", None) == "CANDIDATO":
                est = (
                    Estudio.objects.filter(solicitud__candidato__email=self.request.user.email)
                    .order_by("-solicitud__created_at")
                    .first()
                )
            if not est:
                raise ValidationError({"estudio": ["Este campo es requerido."]})

        self.validar_acceso_a_estudio(est)
        self._bloqueo_si_no_editable(est)

        serializer.save(estudio=est, candidato=est.solicitud.candidato)

        _ensure_item_modulo(est, getattr(ItemTipo, "ACADEMICO", "ACADEMICO"))
        prev = int(est.progreso or 0)
        est.recalcular()
        _bump_progreso(est, max(prev, int(est.progreso or 0)))

    def perform_update(self, serializer):
        instance = serializer.instance
        self.validar_acceso_a_estudio(instance.estudio)
        self._bloqueo_si_no_editable(instance.estudio)

        serializer.save(estudio=instance.estudio, candidato=instance.candidato)

        _ensure_item_modulo(instance.estudio, getattr(ItemTipo, "ACADEMICO", "ACADEMICO"))
        prev = int(instance.estudio.progreso or 0)
        instance.estudio.recalcular()
        _bump_progreso(instance.estudio, max(prev, int(instance.estudio.progreso or 0)))

    def perform_destroy(self, instance):
        est = instance.estudio
        self.validar_acceso_a_estudio(est)
        self._bloqueo_si_no_editable(est)
        super().perform_destroy(instance)

        _ensure_item_modulo(est, getattr(ItemTipo, "ACADEMICO", "ACADEMICO"))
        prev = int(est.progreso or 0)
        est.recalcular()
        _bump_progreso(est, max(prev, int(est.progreso or 0)))


# ======================================================================================
# Laboral
# ======================================================================================
class LaboralViewSet(BaseRolMixin, viewsets.ModelViewSet):
    queryset = Laboral.objects.all().select_related("estudio", "candidato")
    serializer_class = LaboralSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        est_id = self.request.query_params.get("estudio")
        if est_id:
            qs = qs.filter(estudio_id=est_id)
        if getattr(self.request.user, "rol", None) == "CANDIDATO":
            qs = qs.filter(candidato__email=self.request.user.email)
        return self.filtrar_por_rol(qs)

    def _bloqueo_si_no_editable(self, est: Estudio):
        if getattr(self.request.user, "rol", None) == "CANDIDATO" and not est.editable_por_candidato:
            raise ValidationError({"detail": ["El estudio estÃ¡ bloqueado; no puedes editar."]})

    def perform_create(self, serializer):
        est_id = self.request.data.get("estudio") or self.request.query_params.get("estudio")
        est = None
        if est_id:
            try:
                est = Estudio.objects.get(pk=est_id)
            except Estudio.DoesNotExist:
                raise ValidationError({"estudio": ["No existe."]})
        else:
            if getattr(self.request.user, "rol", None) == "CANDIDATO":
                est = (
                    Estudio.objects.filter(solicitud__candidato__email=self.request.user.email)
                    .order_by("-solicitud__created_at")
                    .first()
                )
            if not est:
                raise ValidationError({"estudio": ["Este campo es requerido."]})

        self.validar_acceso_a_estudio(est)
        self._bloqueo_si_no_editable(est)

        serializer.save(estudio=est, candidato=est.solicitud.candidato)

        _ensure_item_modulo(est, getattr(ItemTipo, "LABORAL", "LABORAL"))
        prev = int(est.progreso or 0)
        est.recalcular()
        _bump_progreso(est, max(prev, int(est.progreso or 0)))

    def perform_update(self, serializer):
        instance = serializer.instance
        self.validar_acceso_a_estudio(instance.estudio)
        self._bloqueo_si_no_editable(instance.estudio)

        serializer.save(estudio=instance.estudio, candidato=instance.candidato)

        _ensure_item_modulo(instance.estudio, getattr(ItemTipo, "LABORAL", "LABORAL"))
        prev = int(instance.estudio.progreso or 0)
        instance.estudio.recalcular()
        _bump_progreso(instance.estudio, max(prev, int(instance.estudio.progreso or 0)))

    def perform_destroy(self, instance):
        est = instance.estudio
        self.validar_acceso_a_estudio(est)
        self._bloqueo_si_no_editable(est)
        super().perform_destroy(instance)

        _ensure_item_modulo(est, getattr(ItemTipo, "LABORAL", "LABORAL"))
        prev = int(est.progreso or 0)
        est.recalcular()
        _bump_progreso(est, max(prev, int(est.progreso or 0)))

class EstudioReferenciaViewSet(BaseRolMixin, viewsets.ModelViewSet):
    queryset = EstudioReferencia.objects.select_related(
            "estudio",
            "estudio__solicitud",
            "estudio__solicitud__empresa",
            "estudio__solicitud__analista",
            "estudio__solicitud__candidato",
        )
    serializer_class = EstudioReferenciaSerializer

    def get_queryset(self):
        qs = self.filtrar_por_rol(super().get_queryset())
        est_id = self.request.query_params.get("estudio")
        return qs.filter(estudio_id=est_id) if est_id else qs.none()

    def _check_editable(self, est):
        # Solo ANALISTA/ADMIN y estudio no cerrado
        rol = getattr(self.request.user, "rol", "")
        if rol not in ("ANALISTA", "ADMIN"):
            raise ValidationError({"detail": ["Sin permiso."]})
        if (est.estado or "").upper() == "CERRADO":
            raise ValidationError({"detail": ["El estudio estÃ¡ cerrado."]})

    def perform_create(self, serializer):
        est_id = self.request.data.get("estudio") or self.request.query_params.get("estudio")
        if not est_id:
            raise ValidationError({"estudio": ["Requerido."]})
        est = Estudio.objects.filter(pk=est_id).first()
        if not est:
            raise ValidationError({"estudio": ["No existe."]})

        self.validar_acceso_a_estudio(est)
        self._check_editable(est)

        serializer.save(estudio=est)

    def perform_update(self, serializer):
        inst = serializer.instance
        self.validar_acceso_a_estudio(inst.estudio)
        self._check_editable(inst.estudio)
        serializer.save()

    def perform_destroy(self, instance):
        est = instance.estudio
        self.validar_acceso_a_estudio(est)
        self._check_editable(est)
        super().perform_destroy(instance)

class ReferenciaPersonalViewSet(BaseRolMixin, viewsets.ModelViewSet):
    queryset = ReferenciaPersonal.objects.select_related(
        "estudio","estudio__solicitud","estudio__solicitud__candidato","estudio__solicitud__analista"
    )
    serializer_class = ReferenciaPersonalSerializer

    def get_queryset(self):
        qs = self.filtrar_por_rol(super().get_queryset())
        est_id = self.request.query_params.get("estudio")
        return qs.filter(estudio_id=est_id) if est_id else qs.none()

    def _bloqueo_si_no_editable(self, est: Estudio):
        if getattr(self.request.user, "rol", None) == "CANDIDATO" and not est.editable_por_candidato:
            raise ValidationError({"detail": ["El estudio estÃ¡ bloqueado; no puedes editar."]})

    def perform_create(self, serializer):
        est_id = self.request.data.get("estudio") or self.request.query_params.get("estudio")
        if not est_id:
            raise ValidationError({"estudio": ["Requerido."]})
        est = Estudio.objects.filter(pk=est_id).first() or None
        if not est:
            raise ValidationError({"estudio": ["No existe."]})

        self.validar_acceso_a_estudio(est)
        self._bloqueo_si_no_editable(est)

        obj = serializer.save(estudio=est, candidato=est.solicitud.candidato)

        # asegura el item del mÃ³dulo
        _ensure_item_modulo(est, ItemTipo.REFERENCIAS_PERSONALES)
        prev = int(est.progreso or 0)
        est.recalcular()
        _bump_progreso(est, max(prev, int(est.progreso or 0)))
        return obj

    def perform_update(self, serializer):
        inst = serializer.instance
        self.validar_acceso_a_estudio(inst.estudio)
        self._bloqueo_si_no_editable(inst.estudio)

        # si el usuario es ANALISTA, permitir actualizar solo concepto_analista
        if str(getattr(self.request.user, "rol","")).upper() == "ANALISTA":
            serializer.save(concepto_analista=self.request.data.get("concepto_analista", inst.concepto_analista))
        else:
            serializer.save()

    def perform_destroy(self, instance):
        est = instance.estudio
        self.validar_acceso_a_estudio(est)
        self._bloqueo_si_no_editable(est)
        super().perform_destroy(instance)


class PatrimonioViewSet(BaseRolMixin, viewsets.ModelViewSet):
    queryset = Patrimonio.objects.select_related(
        "estudio","estudio__solicitud","estudio__solicitud__candidato","estudio__solicitud__analista"
    )
    serializer_class = PatrimonioSerializer

    def get_queryset(self):
        qs = self.filtrar_por_rol(super().get_queryset())
        est_id = self.request.query_params.get("estudio")
        return qs.filter(estudio_id=est_id) if est_id else qs

    def _bloqueo_si_no_editable(self, est: Estudio):
        if getattr(self.request.user, "rol", None) == "CANDIDATO" and not est.editable_por_candidato:
            raise ValidationError({"detail": ["El estudio estÃ¡ bloqueado; no puedes editar."]})

    def perform_create(self, serializer):
        est_id = self.request.data.get("estudio") or self.request.query_params.get("estudio")
        if not est_id:
            raise ValidationError({"estudio": ["Requerido."]})
        est = Estudio.objects.filter(pk=est_id).first()
        if not est:
            raise ValidationError({"estudio": ["No existe."]})

        self.validar_acceso_a_estudio(est)
        self._bloqueo_si_no_editable(est)

        obj = serializer.save(estudio=est, candidato=est.solicitud.candidato)

        _ensure_item_modulo(est, ItemTipo.INFO_PATRIMONIO)
        prev = int(est.progreso or 0)
        est.recalcular()
        _bump_progreso(est, max(prev, int(est.progreso or 0)))
        return obj

    def perform_update(self, serializer):
        inst = serializer.instance
        self.validar_acceso_a_estudio(inst.estudio)
        self._bloqueo_si_no_editable(inst.estudio)
        serializer.save()

    def perform_destroy(self, instance):
        est = instance.estudio
        self.validar_acceso_a_estudio(est)
        self._bloqueo_si_no_editable(est)
        super().perform_destroy(instance)
    
    # ===================== ViewSet para configuraciÃ³n de formulario cliente =====================
class ClienteConfiguracionFormularioViewSet(viewsets.ModelViewSet):
    queryset = ClienteConfiguracionFormulario.objects.all()
    serializer_class = ClienteConfiguracionFormularioSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        emp = getattr(user, "empresa", None)
        if getattr(user, "rol", None) == "ADMIN" and self.request.query_params.get("empresa"):
            return ClienteConfiguracionFormulario.objects.filter(empresa_id=self.request.query_params["empresa"])
        if emp:
            return ClienteConfiguracionFormulario.objects.filter(empresa=emp)
        return ClienteConfiguracionFormulario.objects.none()

    def create(self, request, *args, **kwargs):
        data = request.data
        # Si recibimos un array, usar many=True
        is_many = isinstance(data, list)
        serializer = self.get_serializer(data=data, many=is_many)
        serializer.is_valid(raise_exception=True)
        emp = getattr(request.user, "empresa", None)
        if not emp:
            return Response({"detail": "El usuario cliente no tiene empresa asociada."}, status=status.HTTP_400_BAD_REQUEST)
        # Guardar cada configuraciÃ³n asociada a la empresa
        objs = []
        for item in serializer.validated_data if is_many else [serializer.validated_data]:
            item_key = (item["item"] or "").strip().upper()
            if item_key == "ECONOMICO":
                item_key = "ECONOMICA"
            subitem_key = (item["subitem"] or "").strip()
            excluido = item.get("excluido", True)
            obj, created = ClienteConfiguracionFormulario.objects.update_or_create(
                empresa=emp,
                item=item_key,
                subitem=subitem_key,
                defaults={"excluido": excluido}
            )
            objs.append(obj)
            # Registrar en historial (no bloquea el flujo si falla)
            try:
                accion = "ExcluyÃ³ subÃ­tem" if excluido else "IncluyÃ³ subÃ­tem"
                HistorialConfiguracion.objects.create(
                    empresa=emp,
                    usuario=request.user,
                    tipo='formulario',
                    accion=accion,
                    item=item_key,
                    subitem=subitem_key,
                )
            except Exception:
                pass
        # Serializar la respuesta
        out_serializer = self.get_serializer(objs, many=True)
        return Response(out_serializer.data, status=status.HTTP_201_CREATED)      
    
    # ViewSet para polÃ­ticas configurables del cliente
class ClientePoliticaConfiguracionViewSet(viewsets.ModelViewSet):
    queryset = ClientePoliticaConfiguracion.objects.all()
    serializer_class = ClientePoliticaConfiguracionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        empresa_id = self.request.query_params.get('empresa')
        qs = super().get_queryset()
        if empresa_id:
            qs = qs.filter(empresa_id=empresa_id)
        return qs.filter(usuario=user)


    def perform_create(self, serializer):
        emp = getattr(self.request.user, 'empresa', None)
        criterio = serializer.validated_data.get('criterio')
        opcion = serializer.validated_data.get('opcion')
        existe_bloqueada = ClientePoliticaConfiguracion.objects.filter(
            empresa=emp, criterio=criterio, opcion=opcion, bloqueado=True
        ).exists()
        if existe_bloqueada and not self.request.user.is_superuser:
            raise ValidationError('La configuraciÃ³n de polÃ­ticas estÃ¡ bloqueada. Contacta al administrador.')
        serializer.save(usuario=self.request.user, empresa=emp, bloqueado=True)
        try:
            no_relevante = serializer.validated_data.get('no_relevante', True)
            accion = "MarcÃ³ no relevante" if no_relevante else "DesmarcÃ³ no relevante"
            HistorialConfiguracion.objects.create(
                empresa=emp,
                usuario=self.request.user,
                tipo='politica',
                accion=accion,
                item=criterio.upper(),
                subitem=opcion,
            )
        except Exception:
            pass

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.bloqueado and not request.user.is_superuser:
            return Response({'detail': 'La configuraciÃ³n de polÃ­ticas estÃ¡ bloqueada. Contacta al administrador.'}, status=403)
        response = super().update(request, *args, **kwargs)
        instance.refresh_from_db()
        instance.bloqueado = True
        instance.save(update_fields=['bloqueado'])
        try:
            no_relevante = request.data.get('no_relevante')
            if no_relevante is not None:
                accion = "MarcÃ³ no relevante" if no_relevante else "DesmarcÃ³ no relevante"
                HistorialConfiguracion.objects.create(
                    empresa=instance.empresa,
                    usuario=request.user,
                    tipo='politica',
                    accion=accion,
                    item=instance.criterio.upper(),
                    subitem=instance.opcion,
                )
        except Exception:
            pass
        return response

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.bloqueado and not request.user.is_superuser:
            return Response({'detail': 'La configuraciÃ³n de polÃ­ticas estÃ¡ bloqueada. Contacta al administrador.'}, status=403)
        response = super().partial_update(request, *args, **kwargs)
        instance.refresh_from_db()
        instance.bloqueado = True
        instance.save(update_fields=['bloqueado'])
        try:
            no_relevante = request.data.get('no_relevante')
            if no_relevante is not None:
                accion = "MarcÃ³ no relevante" if no_relevante else "DesmarcÃ³ no relevante"
                HistorialConfiguracion.objects.create(
                    empresa=instance.empresa,
                    usuario=request.user,
                    tipo='politica',
                    accion=accion,
                    item=instance.criterio.upper(),
                    subitem=instance.opcion,
                )
        except Exception:
            pass
        return response


class HistorialConfiguracionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = HistorialConfiguracionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        emp = getattr(user, 'empresa', None)
        if emp:
            return HistorialConfiguracion.objects.filter(empresa=emp)
        if user.is_superuser:
            return HistorialConfiguracion.objects.all()
        return HistorialConfiguracion.objects.none()


# ======================================================================================
# Disponibilidad global del analista (agenda tipo mÃ©dico)
# ======================================================================================

class DisponibilidadAnalistaViewSet(viewsets.ModelViewSet):
    """
    GestiÃ³n de la agenda global del analista.

    GET    /api/disponibilidad-analista/          â€” mis slots (analista) / todos (admin)
    POST   /api/disponibilidad-analista/          â€” crear slot  { fecha, hora_inicio }
    DELETE /api/disponibilidad-analista/{id}/     â€” eliminar slot (solo si DISPONIBLE)

    Filtros GET opcionales:
      ?analista_id=<id>   â€” filtrar por analista (admin Ãºnicamente)
      ?fecha=YYYY-MM-DD   â€” filtrar por fecha exacta
    """
    serializer_class = DisponibilidadAnalistaSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        rol = str(getattr(user, "rol", "")).upper()
        qs = DisponibilidadAnalista.objects.select_related(
            "analista",
            "estudio_reservado",
            "estudio_reservado__solicitud",
            "estudio_reservado__solicitud__candidato",
        ).prefetch_related(
            Prefetch(
                "reuniones_agendadas",
                queryset=ReunionVirtualAgendada.objects.order_by("-agendado_at"),
            )
        )

        if rol == "ADMIN":
            analista_id = self.request.query_params.get("analista_id")
            if analista_id:
                qs = qs.filter(analista_id=analista_id)
        elif rol == "ANALISTA":
            qs = qs.filter(analista=user)
        else:
            return DisponibilidadAnalista.objects.none()

        fecha = self.request.query_params.get("fecha")
        if fecha:
            qs = qs.filter(fecha=fecha)

        return qs

    def perform_create(self, serializer):
        user = self.request.user
        rol = str(getattr(user, "rol", "")).upper()
        if rol not in {"ANALISTA", "ADMIN"}:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Solo analistas y administradores pueden crear disponibilidad.")
        fecha_slot = serializer.validated_data.get("fecha")
        hoy = timezone.localdate()
        estudios_a_notificar = []
        qs_estudios = (
            Estudio.objects.select_related("solicitud", "solicitud__candidato", "solicitud__analista", "solicitud__empresa")
            .filter(solicitud__analista=user, habilitado_candidato_at__isnull=False)
        )
        for estudio in qs_estudios:
            reunion = getattr(estudio, "reunion_agendada", None)
            if reunion and reunion.estado in (
                ReunionVirtualAgendada.Estado.PENDIENTE,
                ReunionVirtualAgendada.Estado.CONFIRMADA,
            ):
                continue
            fecha_limite = estudio.fecha_limite_agendamiento()
            if not fecha_limite or hoy > fecha_limite or not fecha_slot or fecha_slot < hoy or fecha_slot > fecha_limite:
                continue
            ya_tenia_disponibilidad = DisponibilidadAnalista.objects.filter(
                analista=user,
                estado=DisponibilidadAnalistaEstado.DISPONIBLE,
                fecha__gte=hoy,
                fecha__lte=fecha_limite,
            ).exists()
            if not ya_tenia_disponibilidad:
                estudios_a_notificar.append(estudio.id)

        serializer.save(analista=user)
        slot = serializer.instance
        if estudios_a_notificar:
            transaction.on_commit(
                lambda estudio_ids=tuple(estudios_a_notificar), slot_id=slot.id, actor_id=user.id: [
                    _enviar_correos_reunion_virtual(
                        estudio=Estudio.objects.select_related("solicitud", "solicitud__candidato", "solicitud__analista", "solicitud__empresa").get(pk=estudio_id),
                        evento="DISPONIBILIDAD",
                        slot=DisponibilidadAnalista.objects.get(pk=slot_id),
                        actor=get_user_model().objects.get(pk=actor_id),
                    )
                    for estudio_id in estudio_ids
                ]
            )

    def destroy(self, request, *args, **kwargs):
        slot = self.get_object()
        if slot.estado == DisponibilidadAnalistaEstado.RESERVADO:
            return Response(
                {"detail": "No se puede eliminar un slot ya reservado. Cancela la reuniÃ³n primero."},
                status=400,
            )
        return super().destroy(request, *args, **kwargs)

