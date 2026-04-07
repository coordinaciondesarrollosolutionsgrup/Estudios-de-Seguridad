# ...existing imports...


# apps/studies/views.py
from io import BytesIO
import io
import os
import base64
import urllib.request
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q, Count
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
    # mínimo: al menos nombre o teléfono
    if not (out["nombres"] or out["telefono"]):
        return {}
    return out


def _collect_refs_from_request(data):
    """
    Soporta:
      { "referencias": [ ... ] }
      { "laborales": [ ... ], "personales": [ ... ] }
      [ ... ]  (lista directa)
    Devuelve lista normalizada, máx 6 (3+3).
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
    """Dibuja texto subrayado y le agrega una anotación linkURL clickeable."""
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
    considerando únicamente los tipos vigentes que mostramos en el UI.
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

    # Datos principalmente útiles para analista:
    _clone_model_rows(EstudioReferencia, EstudioReferencia.objects.filter(estudio=prev_est).order_by("id"), estudio_destino=new_est, candidato_destino=cand)
    _clone_model_rows(
        EstudioDocumento,
        EstudioDocumento.objects.filter(estudio=prev_est, categoria="CENTRALES").order_by("id"),
        estudio_destino=new_est,
        candidato_destino=cand,
    )


# ======================================================================================
# Helper: llenado real del candidato por módulo
# ======================================================================================

def _candidato_fill(est: Estudio):
    """
    Devuelve (fill_dict, progreso_pct) donde fill_dict mapea tipo de item →
      True  = candidato ya ingresó datos en este módulo,
      False = módulo vacío,
      None  = módulo que llena el analista (N/A para candidato).
    """
    cand = est.solicitud.candidato

    fill = {}

    # BIOGRAFICOS – campos clave del candidato
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

    # LISTAS_RESTRICTIVAS – lo llena el analista, no el candidato
    fill["LISTAS_RESTRICTIVAS"] = None

    # Progreso candidato: solo módulos con valor bool (excluye None)
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

        # Marcar estudio como "a consideración del cliente" SOLO si las políticas están
        # actualmente bloqueadas (el cliente las configuró y aún no las ha desbloqueado el admin).
        # Si el admin desbloqueó (bloqueado=False) o el cliente nunca las configuró, no aplica.
        from .models import ClientePoliticaConfiguracion, ClienteConfiguracionFormulario
        politicas_bloqueadas_activas = ClientePoliticaConfiguracion.objects.filter(
            empresa=emp, bloqueado=True, no_relevante=True
        ).exists()
        subitems_excluidos = ClienteConfiguracionFormulario.objects.filter(empresa=emp, excluido=True).exists()
        usar_politicas_cliente = politicas_bloqueadas_activas  # se activa automáticamente si políticas están bloqueadas

        solicitud = serializer.save(empresa=emp)
        solicitud.estado = getattr(getattr(Solicitud, "Estado", None), "PENDIENTE_INVITACION", "PENDIENTE_INVITACION")
        solicitud.save(update_fields=["estado"])

        nuevo_estudio = getattr(solicitud, "estudio", None)
        if nuevo_estudio:
            previo = _latest_previous_study(solicitud.candidato, exclude_estudio_id=nuevo_estudio.id)
            if previo:
                _migrate_relevant_data_from_previous_study(previo, nuevo_estudio)

        # Si se crea el Estudio aquí, marcarlo como a_consideracion_cliente si corresponde
        if hasattr(solicitud, "estudio"):
            estudio = solicitud.estudio
            if usar_politicas_cliente or subitems_excluidos:
                estudio.a_consideracion_cliente = True
                estudio.save(update_fields=["a_consideracion_cliente"])

        # Asignación equitativa (round-robin): el analista con menos estudios asignados
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
                    f"Empresa: {solicitud.empresa} – "
                    f"Candidato: {solicitud.candidato.nombre} {solicitud.candidato.apellido} "
                    f"({solicitud.candidato.cedula})"
                ),
                solicitud=solicitud,
            )
            # Enviar notificación al analista
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
                "estado": "Su estudio ha sido enviado al analista. Espere activación.",
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
        # Admin puede todo, los demás roles no editan
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
            # El propietario ve ubicación; otros analistas solo ven estado básico
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
            return Response({"detail": "No hay reunión virtual activa para este estudio."}, status=404)

        vv.estado = VisitaVirtualEstado.FINALIZADA
        vv.finalizada_at = timezone.now()
        vv.save(update_fields=["estado", "finalizada_at", "updated_at"])
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
            return Response({"detail": "No hay reunión virtual activa."}, status=400)

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
            return Response({"detail": "No hay reunión virtual activa."}, status=400)
        if not vv.consentida_por_candidato:
            return Response({"detail": "Debes aceptar compartir ubicación antes de enviar coordenadas."}, status=400)

        try:
            lat = Decimal(str(request.data.get("lat")))
            lng = Decimal(str(request.data.get("lng")))
        except (InvalidOperation, TypeError, ValueError):
            return Response({"detail": "lat/lng inválidos."}, status=400)

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
                # ✅ el front soporta lista o {laborales,personales}; devolver lista aquí ok
                return Response(ser.data)

            # 🔁 Fallback: derivar de registros Laboral si no hay referencias guardadas
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

            # Si no tienes de dónde sacar personales, déjalo vacío.
            personales = []

            # ✅ El front también soporta este formato
            return Response({"laborales": laborales, "personales": personales})

        # POST (append)
        rol = str(getattr(request.user, "rol", "")).upper()
        if rol not in {"ANALISTA", "ADMIN"}:
            return Response({"detail": "Sin permiso."}, status=403)
        if (est.estado or "").upper() == "CERRADO":
            return Response({"detail": "El estudio está cerrado."}, status=400)

        rows = _collect_refs_from_request(request.data)
        if not rows:
            return Response({"detail": "Payload vacío o inválido."}, status=400)

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
            return Response({"detail": "El estudio está cerrado."}, status=400)

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
            return Response({"detail": "La evaluación se habilita cuando el estudio está cerrado."}, status=400)

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

        # POST — solo el candidato del estudio puede registrar/actualizar
        if rol != "CANDIDATO" or est.solicitud.candidato.email != request.user.email:
            return Response({"detail": "Solo el candidato puede registrar disponibilidad."}, status=403)

        disp, _ = DisponibilidadReunionCandidato.objects.get_or_create(estudio=est)
        ser = DisponibilidadReunionSerializer(disp, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
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
        """Observación global del estudio (analista/admin)."""
        est = self.get_object()
        if getattr(request.user, "rol", None) not in ("ANALISTA", "ADMIN"):
            return Response({"detail": "Sin permiso."}, status=403)
        denied = self._check_owner(est, request)
        if denied:
            return denied

        if (getattr(est, "estado", "") or "").upper() == "CERRADO":
            return Response({"detail": "El estudio está cerrado."}, status=400)

        obs = (request.data.get("observacion") or request.data.get("comentario") or "").strip()
        Estudio.objects.filter(pk=est.pk).update(observacion_analista=obs or None)
        est.observacion_analista = obs or None
        return Response({"ok": True, "observacion_analista": est.observacion_analista})

    def retrieve(self, request, *args, **kwargs):
        est = self.get_object()
        _recalcular_progreso_anexos(est)
        ser = self.get_serializer(est)
        data = ser.data

        # ⬇️ Si es CANDIDATO y el estudio está cerrado y NO ha enviado la evaluación
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
            return Response({"detail": "El estudio ya está cerrado."}, status=400)

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

        # ⬇️ Asegura que exista registro de evaluación para el candidato
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
            return Response({"detail": "El estudio ya fue enviado o está cerrado."}, status=400)

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
                "subject": f"Corrección requerida en estudio #{est.id}",
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

        # ── Calcular llenado real del candidato por módulo ──
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
        c.drawString(40, y, f"Autorización: {'Firmada' if est.autorizacion_firmada else 'Pendiente'}")
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
                c.drawString(50, y, "• ")
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
            c.drawString(50, y, "— Sin documentos —")
            y -= 14

        y -= 10

        # Anexos fotográficos (thumbnails con link)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(40, y, "Anexos fotográficos")
        y -= 20

        anexos = AnexoFoto.objects.filter(estudio=est).order_by("orden", "tipo", "-creado")
        if anexos.exists():
            cols = 3
            gap = 8
            thumb_w = (w - 80 - gap * (cols - 1)) / cols  # márgenes 40/40
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
            c.drawString(40, y, "— Sin anexos —")

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
            return Response({"detail": "Tipo de consentimiento inválido."}, status=400)

        qs = EstudioConsentimiento.objects.filter(estudio=est, aceptado=True)
        if tipo:
            qs = qs.filter(tipo=tipo)
        consentimientos = list(qs.order_by("tipo", "id"))
        if not consentimientos:
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
        tipo_label = dict(ConsentimientoTipo.choices)

        # Textos legales por tipo de consentimiento
        CONSENT_TEXTS = {
            "GENERAL": (
                "El candidato autoriza a la empresa y a sus aliados a recolectar, almacenar, usar y compartir "
                "sus datos personales con fines de validación de identidad, verificación de antecedentes y "
                "evaluación de aptitud para el cargo, conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013."
            ),
            "CENTRALES": (
                "El candidato autoriza expresamente la consulta de su historial en centrales de riesgo "
                "(DataCrédito, TransUnión, CIFIN y similares) con el fin de evaluar su perfil financiero "
                "como parte del proceso de selección, según lo dispuesto en la Ley 1266 de 2008."
            ),
            "ACADEMICO": (
                "El candidato autoriza la verificación de sus títulos, certificados y demás credenciales "
                "académicas ante las instituciones educativas correspondientes, incluyendo el contacto "
                "directo con dichas entidades para confirmar la autenticidad de la información suministrada."
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
            # Cabecera sólida con degradado simulado (dos rectángulos)
            c.setFillColor(C_NAVY)
            c.rect(0, h - 120, w, 120, stroke=0, fill=1)
            c.setFillColor(C_NAVY2)
            c.rect(0, h - 120, w, 30, stroke=0, fill=1)

            # Línea de acento azul bajo el header
            c.setFillColor(C_ACCENT)
            c.rect(0, h - 122, w, 3, stroke=0, fill=1)

            # Logo de empresa
            logo = _image_reader_from_logo_url(request, logo_url)
            if logo:
                c.drawImage(logo, 22, h - 108, width=68, height=55,
                            preserveAspectRatio=True, mask="auto")
                text_x = 104
            else:
                # Placeholder cuadrado si no hay logo
                c.setFillColor(C_ACCENT)
                c.roundRect(22, h - 108, 55, 55, 6, stroke=0, fill=1)
                c.setFillColor(C_WHITE)
                c.setFont("Helvetica-Bold", 18)
                c.drawCentredString(49, h - 76, nombre_empresa[:2].upper())
                text_x = 90

            # Título principal
            c.setFillColor(C_WHITE)
            c.setFont("Helvetica-Bold", 16)
            c.drawString(text_x, h - 48, "ACTA DE CONSENTIMIENTOS FIRMADOS")

            # Subtítulo
            c.setFont("Helvetica", 9)
            c.setFillColor(colors.HexColor("#93c5fd"))
            c.drawString(text_x, h - 64, f"Estudio #{est.id}  ·  Generado el {now_local.strftime('%d de %B de %Y a las %H:%M')}")
            c.drawString(text_x, h - 78, f"{nombre_empresa}  ·  NIT: {nit_empresa}")

            # Número de página (esquina superior derecha)
            c.setFont("Helvetica", 8)
            c.setFillColor(colors.HexColor("#93c5fd"))
            c.drawRightString(w - 22, h - 64, f"Página {page[0]}")

            # Tarjeta de datos del candidato
            c.setFillColor(colors.HexColor("#0d1f3c"))
            c.roundRect(18, h - 168, w - 36, 42, 6, stroke=0, fill=1)
            c.setStrokeColor(colors.HexColor("#1e3a5f"))
            c.roundRect(18, h - 168, w - 36, 42, 6, stroke=1, fill=0)

            # Ícono persona (círculo pequeño)
            c.setFillColor(C_ACCENT)
            c.circle(36, h - 147, 8, stroke=0, fill=1)
            c.setFillColor(C_WHITE)
            c.setFont("Helvetica-Bold", 8)
            c.drawCentredString(36, h - 150, "C")

            c.setFillColor(colors.HexColor("#e2e8f0"))
            c.setFont("Helvetica-Bold", 9)
            c.drawString(52, h - 140, nombre_candidato)
            c.setFont("Helvetica", 8)
            c.setFillColor(colors.HexColor("#94a3b8"))
            c.drawString(52, h - 153, f"C.C. {cedula}  ·  {email_candidato}")

            # Total de formatos
            total = len(consentimientos)
            label = f"{total} formato{'s' if total != 1 else ''} firmado{'s' if total != 1 else ''}"
            c.setFillColor(C_GREEN)
            c.setFont("Helvetica-Bold", 8)
            c.drawRightString(w - 28, h - 140, "✓ " + label)

        def draw_footer():
            c.setFillColor(C_FOOTER)
            c.rect(0, 0, w, 32, stroke=0, fill=1)
            c.setFillColor(C_ACCENT)
            c.rect(0, 32, w, 1.5, stroke=0, fill=1)
            c.setFont("Helvetica", 7)
            c.setFillColor(colors.HexColor("#94a3b8"))
            c.drawString(22, 19, "Documento generado automáticamente por la plataforma eConfia · Evidencia digital de consentimientos informados")
            c.drawRightString(w - 22, 19, f"Estudio #{est.id}  ·  Página {page[0]}")
            c.drawCentredString(w / 2, 8, now_local.strftime("Emitido el %d/%m/%Y a las %H:%M hrs"))

        # Anchos de columna fijos para metadatos
        META_COL = 90  # ancho de la etiqueta en puntos

        draw_page_background()
        draw_header()
        y = h - 190

        for idx, cons in enumerate(consentimientos):
            # ── Pre-calcular contenido variable ──────────────────────────
            ua_lines    = _wrap_pdf_text(cons.user_agent or "N/A", max_len=76)[:2]
            text_lines  = _wrap_pdf_text(CONSENT_TEXTS.get(cons.tipo, ""), max_len=80)
            has_ua2     = len(ua_lines) > 1

            # Alturas de secciones (fijas)
            H_HEADER    = 32   # badges + padding top
            H_SEP1      = 8    # separador tras badges
            H_META      = 13 * 3 + (13 if has_ua2 else 0)  # 3 filas + línea ua extra
            H_GAP1      = 10   # gap entre meta y texto legal
            H_TEXT      = len(text_lines) * 11 + 14 if text_lines else 0
            H_GAP2      = 12   # gap entre texto legal y sección firmas
            H_SIG_HDR   = 22   # "EVIDENCIA DE FIRMAS" + separador
            H_SIG_LBL   = 14   # etiquetas sobre las cajas
            H_SIG_BOX   = 80   # altura de las cajas de firma
            H_PAD_BOT   = 16   # padding inferior

            card_h = (H_HEADER + H_SEP1 + H_META + H_GAP1
                      + H_TEXT + H_GAP2 + H_SIG_HDR
                      + H_SIG_LBL + H_SIG_BOX + H_PAD_BOT)

            if y - card_h < 50:
                draw_footer()
                c.showPage()
                page[0] += 1
                draw_page_background()
                draw_header()
                y = h - 190

            accent_hex, border_hex, bg_hex = TIPO_COLORS.get(cons.tipo, ("#1e40af", "#dbeafe", "#eff6ff"))
            C_CARD_ACCENT = colors.HexColor(accent_hex)
            C_CARD_BORDER = colors.HexColor(border_hex)
            C_CARD_BG     = colors.HexColor(bg_hex)

            card_top = y
            card_bot = y - card_h

            # ── Fondo y marco de tarjeta ─────────────────────────────────
            c.setFillColor(colors.HexColor("#d1d5db"))   # sombra
            c.roundRect(21, card_bot - 3, w - 40, card_h, 8, stroke=0, fill=1)
            c.setFillColor(C_CARD_BG)
            c.roundRect(18, card_bot, w - 36, card_h, 8, stroke=0, fill=1)
            c.setStrokeColor(C_CARD_BORDER)
            c.setLineWidth(1)
            c.roundRect(18, card_bot, w - 36, card_h, 8, stroke=1, fill=0)
            c.setFillColor(C_CARD_ACCENT)               # barra lateral
            c.roundRect(18, card_bot, 5, card_h, 4, stroke=0, fill=1)

            # ── Badges ───────────────────────────────────────────────────
            cy = card_top - 8   # cursor y (texto en baseline)
            tipo_txt = tipo_label.get(cons.tipo, cons.tipo).upper()
            badge_w = len(tipo_txt) * 5.2 + 16
            c.setFillColor(C_CARD_ACCENT)
            c.roundRect(32, cy - 14, badge_w, 16, 8, stroke=0, fill=1)
            c.setFillColor(C_WHITE)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(40, cy - 5, tipo_txt)

            c.setFillColor(C_GREEN)
            c.roundRect(32 + badge_w + 8, cy - 14, 62, 16, 8, stroke=0, fill=1)
            c.setFillColor(C_WHITE)
            c.setFont("Helvetica-Bold", 7)
            c.drawString(32 + badge_w + 17, cy - 5, "✓  FIRMADO")

            c.setFont("Helvetica", 8)
            c.setFillColor(C_MUTED)
            c.drawRightString(w - 28, cy - 5, f"#{idx + 1} de {len(consentimientos)}")

            # ── Separador ────────────────────────────────────────────────
            cy -= H_HEADER
            c.setStrokeColor(C_CARD_BORDER)
            c.setLineWidth(0.5)
            c.line(28, cy, w - 28, cy)
            cy -= H_SEP1

            # ── Metadatos ────────────────────────────────────────────────
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

            # ── Bloque de texto legal ────────────────────────────────────
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

            # ── Encabezado sección firmas ─────────────────────────────────
            c.setFont("Helvetica-Bold", 8)
            c.setFillColor(C_MUTED)
            c.drawString(32, cy, "EVIDENCIA DE FIRMAS")
            cy -= 6
            c.setStrokeColor(C_CARD_BORDER)
            c.setLineWidth(0.5)
            c.line(32, cy, w - 28, cy)
            cy -= (H_SIG_HDR - 6)

            # ── Cajas de firma ───────────────────────────────────────────
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

            # Caja izquierda — solo trazo digital
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

            # Caja derecha — imagen subida
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
            return Response({"detail": "Tipo inválido."}, status=400)

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
            return Response({"progreso": ["Debe ser un número."]}, status=400)

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
            return Response({"detail": "El estudio está cerrado."}, status=400)

        comentario = (request.data.get("comentario") or "").strip()
        if comentario:
            item.comentario = comentario
            item.save(update_fields=["comentario"])
        item.marcar_validado(puntaje=0)
        return Response({"ok": True})

    @action(detail=True, methods=["post"])
    def reportar(self, request, pk=None):
        """Guarda irregularidad/nota en el ítem (no cambia el estado)."""
        if getattr(request.user, "rol", None) not in ("ANALISTA", "ADMIN"):
            return Response({"detail": "Sin permiso."}, status=403)

        item = self.get_object()
        if (item.estudio.estado or "").upper() == "CERRADO":
            return Response({"detail": "El estudio está cerrado."}, status=400)

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
# Económica
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
            raise ValidationError({"detail": ["El estudio está bloqueado; no puedes editar."]})

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
# Anexos Fotográficos
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
            raise ValidationError({"detail": ["El estudio está bloqueado; no puedes editar."]})

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
# Académico
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
            raise ValidationError({"detail": ["El estudio está bloqueado; no puedes editar."]})

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
            raise ValidationError({"detail": ["El estudio está bloqueado; no puedes editar."]})

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
            raise ValidationError({"detail": ["El estudio está cerrado."]})

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
            raise ValidationError({"detail": ["El estudio está bloqueado; no puedes editar."]})

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

        # asegura el item del módulo
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
            raise ValidationError({"detail": ["El estudio está bloqueado; no puedes editar."]})

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
    
    # ===================== ViewSet para configuración de formulario cliente =====================
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
        # Guardar cada configuración asociada a la empresa
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
                accion = "Excluyó subítem" if excluido else "Incluyó subítem"
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
    
    # ViewSet para políticas configurables del cliente
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
            raise ValidationError('La configuración de políticas está bloqueada. Contacta al administrador.')
        serializer.save(usuario=self.request.user, empresa=emp, bloqueado=True)
        try:
            no_relevante = serializer.validated_data.get('no_relevante', True)
            accion = "Marcó no relevante" if no_relevante else "Desmarcó no relevante"
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
            return Response({'detail': 'La configuración de políticas está bloqueada. Contacta al administrador.'}, status=403)
        response = super().update(request, *args, **kwargs)
        instance.refresh_from_db()
        instance.bloqueado = True
        instance.save(update_fields=['bloqueado'])
        try:
            no_relevante = request.data.get('no_relevante')
            if no_relevante is not None:
                accion = "Marcó no relevante" if no_relevante else "Desmarcó no relevante"
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
            return Response({'detail': 'La configuración de políticas está bloqueada. Contacta al administrador.'}, status=403)
        response = super().partial_update(request, *args, **kwargs)
        instance.refresh_from_db()
        instance.bloqueado = True
        instance.save(update_fields=['bloqueado'])
        try:
            no_relevante = request.data.get('no_relevante')
            if no_relevante is not None:
                accion = "Marcó no relevante" if no_relevante else "Desmarcó no relevante"
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
