# ...existing imports...


# apps/studies/views.py
from io import BytesIO
import io
import os
import base64

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.utils.dateparse import parse_date

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
    ClienteConfiguracionFormulario,
    ClientePoliticaConfiguracion,
    HistorialConfiguracion,
)
from .serializers import (
    SolicitudCreateSerializer,
    EstudioSerializer,
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

        # Verificar si existen políticas o subítems excluidos (NO relevantes) para la empresa
        from .models import ClientePoliticaConfiguracion, ClienteConfiguracionFormulario
        politicas_excluidas = ClientePoliticaConfiguracion.objects.filter(empresa=emp, no_relevante=True).exists()
        subitems_excluidos = ClienteConfiguracionFormulario.objects.filter(empresa=emp, excluido=True).exists()

        solicitud = serializer.save(empresa=emp)
        solicitud.estado = getattr(getattr(Solicitud, "Estado", None), "PENDIENTE_INVITACION", "PENDIENTE_INVITACION")
        solicitud.save(update_fields=["estado"])

        # Si se crea el Estudio aquí, marcarlo como a_consideracion_cliente si corresponde
        if hasattr(solicitud, "estudio"):
            estudio = solicitud.estudio
            if politicas_excluidas or subitems_excluidos:
                estudio.a_consideracion_cliente = True
                estudio.save(update_fields=["a_consideracion_cliente"])

        User = get_user_model()
        analista = (
            User.objects.filter(rol="ANALISTA", is_active=True, empresa=emp).order_by("id").first()
            or User.objects.filter(rol="ANALISTA", is_active=True).order_by("id").first()
        )
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

        if not user:
            base_username = cand.email or f"cand_{cand.cedula}"
            username = base_username
            i = 1
            while User.objects.filter(username=username).exists():
                username = f"{base_username}_{i}"
                i += 1
            temp_password = get_random_string(10)
            user = User.objects.create_user(
                username=username, email=cand.email, password=temp_password, rol="CANDIDATO"
            )

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
        .select_related("solicitud", "solicitud__candidato", "solicitud__empresa", "solicitud__analista")
        .prefetch_related("items", "documentos","consentimientos")
    )
    serializer_class = EstudioSerializer


    
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



    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        rol = getattr(user, "rol", None)

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

        secciones = {}
        for it in items:
            sec = it.get_tipo_display() if hasattr(it, "get_tipo_display") else it.tipo
            secciones.setdefault(sec, {"estado": [], "validados": 0, "hallazgos": 0})
            secciones[sec]["estado"].append(it.estado)
            if it.estado == "VALIDADO":
                secciones[sec]["validados"] += 1
            if it.estado == "HALLAZGO":
                secciones[sec]["hallazgos"] += 1

        data = {
            "estudio_id": est.id,
            "progreso": est.progreso,
            "score_cuantitativo": est.score_cuantitativo,
            "nivel_cualitativo": est.nivel_cualitativo,
            "totales": {"items": total, "validados": validados, "hallazgos": hallazgos},
            "secciones": secciones,
            "autorizacion": {
                "firmada": est.autorizacion_firmada,
                "fecha": getattr(est, "autorizacion_fecha", None),
            },
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
            excluido = item.get("excluido", True)
            obj, created = ClienteConfiguracionFormulario.objects.update_or_create(
                empresa=emp,
                item=item["item"],
                subitem=item["subitem"],
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
                    item=item["item"].upper(),
                    subitem=item["subitem"],
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