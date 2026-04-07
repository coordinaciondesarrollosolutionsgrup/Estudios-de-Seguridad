from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework import serializers
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.utils import timezone
from datetime import timedelta
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.conf import settings
from django.db.models import Count, Q
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from urllib.parse import urlparse
import uuid
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .serializers import MeSerializer
from .models import User, Empresa
from .permissions import IsAdmin


def _candidate_access_deadline(user: User):
    if getattr(user, "rol", None) != "CANDIDATO":
        return None
    return user.candidate_access_expires_at or (user.date_joined + timedelta(hours=24))


def _ensure_candidate_not_expired(user: User):
    deadline = _candidate_access_deadline(user)
    if not deadline:
        return
    if timezone.now() <= deadline:
        return
    if user.is_active:
        user.is_active = False
        user.save(update_fields=["is_active"])
    raise serializers.ValidationError(
        {"detail": "Tu acceso como candidato venció (24 horas). Solicita una nueva invitación al analista."}
    )


class CandidateAwareTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        identifier = attrs.get(self.username_field, "")
        user = User.objects.filter(Q(username__iexact=identifier) | Q(email__iexact=identifier)).first()
        if user and getattr(user, "rol", None) == "CANDIDATO":
            _ensure_candidate_not_expired(user)
        return super().validate(attrs)


class CandidateAwareTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        try:
            token = RefreshToken(attrs["refresh"])
            user_id = token.get("user_id")
            user = User.objects.filter(pk=user_id).first()
            if user and getattr(user, "rol", None) == "CANDIDATO":
                _ensure_candidate_not_expired(user)
        except serializers.ValidationError:
            raise
        except Exception:
            # Si algo falla leyendo el token, dejamos el comportamiento estándar.
            pass
        return data


class CandidateAwareTokenObtainPairView(TokenObtainPairView):
    serializer_class = CandidateAwareTokenObtainPairSerializer


class CandidateAwareTokenRefreshView(TokenRefreshView):
    serializer_class = CandidateAwareTokenRefreshSerializer


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        if not email:
            return Response({"detail": "El correo es requerido."}, status=status.HTTP_400_BAD_REQUEST)

        # Always return 200 to avoid exposing which emails exist
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response({"detail": "Si ese correo existe recibirás un enlace en breve."})

        token_generator = PasswordResetTokenGenerator()
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = token_generator.make_token(user)

        frontend_url = getattr(settings, "FRONTEND_URL", "https://conecta.econfia.co")
        reset_url = f"{frontend_url}/reset-password/{uid}/{token}/"

        context = {
            "nombre": user.first_name or user.username,
            "reset_url": reset_url,
        }
        html_message = render_to_string("emails/password_reset.html", context)
        txt_message = (
            f"Hola {context['nombre']},\n\n"
            f"Recibimos una solicitud para restablecer tu contraseña.\n"
            f"Ingresa al siguiente enlace para continuar:\n\n{reset_url}\n\n"
            f"Si no solicitaste este cambio, ignora este correo.\n\n"
            f"El equipo de eConfia"
        )

        try:
            send_mail(
                subject="Recuperación de contraseña — eConfia",
                message=txt_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                html_message=html_message,
                fail_silently=False,
            )
        except Exception:
            return Response(
                {"detail": "No se pudo enviar el correo. Intenta más tarde."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"detail": "Si ese correo existe recibirás un enlace en breve."})


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        uid = request.data.get("uid", "")
        token = request.data.get("token", "")
        new_password = request.data.get("new_password", "")
        confirm_password = request.data.get("confirm_password", "")

        if not all([uid, token, new_password, confirm_password]):
            return Response({"detail": "Todos los campos son requeridos."}, status=status.HTTP_400_BAD_REQUEST)

        if new_password != confirm_password:
            return Response({"detail": "Las contraseñas no coinciden."}, status=status.HTTP_400_BAD_REQUEST)

        if len(new_password) < 8:
            return Response({"detail": "La contraseña debe tener al menos 8 caracteres."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user_pk = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_pk)
        except (User.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Enlace inválido o expirado."}, status=status.HTTP_400_BAD_REQUEST)

        token_generator = PasswordResetTokenGenerator()
        if not token_generator.check_token(user, token):
            return Response({"detail": "El enlace ha expirado o ya fue utilizado."}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save(update_fields=["password"])

        return Response({"detail": "Contraseña actualizada correctamente. Ya puedes iniciar sesión."})


# =============================================================================
# SUPER ADMIN: Gestión de usuarios
# =============================================================================

class AdminUsuariosView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        rol = request.query_params.get("rol", "")
        empresa = request.query_params.get("empresa", "")
        q = request.query_params.get("q", "")

        qs = User.objects.select_related("empresa").order_by("rol", "username")
        if rol:
            qs = qs.filter(rol=rol.upper())
        if empresa:
            qs = qs.filter(empresa_id=empresa)
        if q:
            qs = qs.filter(
                Q(username__icontains=q) | Q(email__icontains=q) |
                Q(first_name__icontains=q) | Q(last_name__icontains=q)
            )

        data = [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "rol": u.rol,
                "is_active": u.is_active,
                "empresa_id": u.empresa_id,
                "empresa_nombre": u.empresa.nombre if u.empresa else None,
                "date_joined": u.date_joined,
            }
            for u in qs
        ]
        return Response(data)

    def post(self, request):
        d = request.data
        username = (d.get("username") or "").strip()
        email = (d.get("email") or "").strip()
        rol = (d.get("rol") or "ANALISTA").upper()
        password = d.get("password") or ""
        first_name = (d.get("first_name") or "").strip()
        last_name = (d.get("last_name") or "").strip()
        empresa_id = d.get("empresa_id")

        if not username or not email or not password:
            return Response({"detail": "username, email y password son requeridos."}, status=400)
        if rol not in ("ADMIN", "ANALISTA", "CLIENTE", "CANDIDATO"):
            return Response({"detail": "Rol inválido."}, status=400)
        if User.objects.filter(username=username).exists():
            return Response({"detail": "Ya existe un usuario con ese username."}, status=400)

        empresa = None
        if empresa_id:
            try:
                empresa = Empresa.objects.get(pk=empresa_id)
            except Empresa.DoesNotExist:
                return Response({"detail": "Empresa no encontrada."}, status=400)

        user = User.objects.create_user(
            username=username, email=email, password=password,
            first_name=first_name, last_name=last_name,
            rol=rol, empresa=empresa,
        )
        return Response({"id": user.id, "username": user.username, "rol": user.rol}, status=201)


class AdminUsuarioDetalleView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def _get_user(self, pk):
        try:
            return User.objects.select_related("empresa").get(pk=pk)
        except User.DoesNotExist:
            return None

    def get(self, request, pk):
        u = self._get_user(pk)
        if not u:
            return Response({"detail": "Usuario no encontrado."}, status=404)
        return Response({
            "id": u.id, "username": u.username, "email": u.email,
            "first_name": u.first_name, "last_name": u.last_name,
            "rol": u.rol, "is_active": u.is_active,
            "empresa_id": u.empresa_id,
            "empresa_nombre": u.empresa.nombre if u.empresa else None,
        })

    def patch(self, request, pk):
        u = self._get_user(pk)
        if not u:
            return Response({"detail": "Usuario no encontrado."}, status=404)

        d = request.data
        prev_is_active = bool(u.is_active)
        requested_is_active = None
        if "email" in d:
            u.email = d["email"].strip()
        if "first_name" in d:
            u.first_name = d["first_name"].strip()
        if "last_name" in d:
            u.last_name = d["last_name"].strip()
        if "rol" in d:
            rol = d["rol"].upper()
            if rol not in ("ADMIN", "ANALISTA", "CLIENTE", "CANDIDATO"):
                return Response({"detail": "Rol inválido."}, status=400)
            u.rol = rol
        if "is_active" in d:
            requested_is_active = bool(d["is_active"])
            u.is_active = requested_is_active
        if "empresa_id" in d:
            eid = d["empresa_id"]
            if eid:
                try:
                    u.empresa = Empresa.objects.get(pk=eid)
                except Empresa.DoesNotExist:
                    return Response({"detail": "Empresa no encontrada."}, status=400)
            else:
                u.empresa = None
        if "password" in d and d["password"]:
            u.set_password(d["password"])

        u.save()

        # Si el super admin reactiva un usuario, notificar por correo.
        reactivated = (requested_is_active is True and not prev_is_active and u.is_active)
        if reactivated and u.email:
            # Para candidatos vencidos, renovar ventana de 24h al reactivar.
            if u.rol == "CANDIDATO":
                now = timezone.now()
                if not u.candidate_access_expires_at or u.candidate_access_expires_at <= now:
                    u.candidate_access_expires_at = now + timedelta(hours=24)
                    u.save(update_fields=["candidate_access_expires_at"])

            context = {
                "nombre": u.first_name or u.username,
                "username": u.username,
                "rol": u.rol,
                "es_candidato": u.rol == "CANDIDATO",
                "access_deadline": u.candidate_access_expires_at if u.rol == "CANDIDATO" else None,
                "frontend_url": getattr(settings, "FRONTEND_URL", "https://conecta.econfia.co"),
            }
            try:
                txt = render_to_string("emails/usuario_reactivado.txt", context)
                html = render_to_string("emails/usuario_reactivado.html", context)
                send_mail(
                    subject="Tu usuario fue reactivado",
                    message=txt,
                    from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@estudio.local"),
                    recipient_list=[u.email],
                    html_message=html,
                    fail_silently=True,
                )
            except Exception:
                pass

        return Response({"detail": "Usuario actualizado."})

    def delete(self, request, pk):
        u = self._get_user(pk)
        if not u:
            return Response({"detail": "Usuario no encontrado."}, status=404)
        if u.pk == request.user.pk:
            return Response({"detail": "No puedes eliminarte a ti mismo."}, status=400)
        u.delete()
        return Response(status=204)


# =============================================================================
# SUPER ADMIN: Gestión de empresas
# =============================================================================

class AdminEmpresasView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _save_logo(self, file_obj):
        if not file_obj:
            return None
        content_type = getattr(file_obj, "content_type", "") or ""
        if not content_type.startswith("image/"):
            raise serializers.ValidationError({"detail": "El archivo del logo debe ser una imagen."})
        if getattr(file_obj, "size", 0) > 3 * 1024 * 1024:
            raise serializers.ValidationError({"detail": "El logo supera el tamaño máximo (3MB)."})

        ext = (file_obj.name.rsplit(".", 1)[-1].lower() if "." in file_obj.name else "png")
        if ext not in {"png", "jpg", "jpeg", "webp", "svg"}:
            ext = "png"

        file_name = f"brand_logos/{uuid.uuid4().hex}.{ext}"
        saved_path = default_storage.save(file_name, ContentFile(file_obj.read()))
        return default_storage.url(saved_path)

    def get(self, request):
        q = request.query_params.get("q", "")
        qs = Empresa.objects.annotate(num_usuarios=Count("usuarios")).order_by("nombre")
        if q:
            qs = qs.filter(Q(nombre__icontains=q) | Q(nit__icontains=q))
        data = [
            {
                "id": e.id, "nombre": e.nombre, "nit": e.nit,
                "email_contacto": e.email_contacto,
                "logo_url": e.logo_url,
                "num_usuarios": e.num_usuarios,
            }
            for e in qs
        ]
        return Response(data)

    def post(self, request):
        d = request.data
        nombre = (d.get("nombre") or "").strip()
        if not nombre:
            return Response({"detail": "El nombre es requerido."}, status=400)
        logo_url = (d.get("logo_url") or "").strip()
        logo_file = request.FILES.get("logo_file")
        if logo_file:
            logo_url = self._save_logo(logo_file)
        empresa = Empresa.objects.create(
            nombre=nombre,
            nit=(d.get("nit") or "").strip(),
            email_contacto=(d.get("email_contacto") or "").strip(),
            logo_url=logo_url,
        )
        return Response({"id": empresa.id, "nombre": empresa.nombre}, status=201)


class AdminEmpresaDetalleView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _get(self, pk):
        try:
            return Empresa.objects.get(pk=pk)
        except Empresa.DoesNotExist:
            return None

    def _save_logo(self, file_obj):
        if not file_obj:
            return None
        content_type = getattr(file_obj, "content_type", "") or ""
        if not content_type.startswith("image/"):
            raise serializers.ValidationError({"detail": "El archivo del logo debe ser una imagen."})
        if getattr(file_obj, "size", 0) > 3 * 1024 * 1024:
            raise serializers.ValidationError({"detail": "El logo supera el tamaño máximo (3MB)."})

        ext = (file_obj.name.rsplit(".", 1)[-1].lower() if "." in file_obj.name else "png")
        if ext not in {"png", "jpg", "jpeg", "webp", "svg"}:
            ext = "png"

        file_name = f"brand_logos/{uuid.uuid4().hex}.{ext}"
        saved_path = default_storage.save(file_name, ContentFile(file_obj.read()))
        return default_storage.url(saved_path)

    def _delete_local_logo(self, logo_url):
        if not logo_url:
            return
        path = urlparse(logo_url).path or ""
        media_url = getattr(settings, "MEDIA_URL", "/media/")
        if not path.startswith(media_url):
            return
        storage_path = path[len(media_url):].lstrip("/")
        if storage_path and default_storage.exists(storage_path):
            default_storage.delete(storage_path)

    def patch(self, request, pk):
        e = self._get(pk)
        if not e:
            return Response({"detail": "Empresa no encontrada."}, status=404)
        d = request.data
        old_logo = e.logo_url
        if "nombre" in d:
            e.nombre = d["nombre"].strip()
        if "nit" in d:
            e.nit = d["nit"].strip()
        if "email_contacto" in d:
            e.email_contacto = d["email_contacto"].strip()
        if "logo_url" in d:
            e.logo_url = (d["logo_url"] or "").strip()
        if request.FILES.get("logo_file"):
            e.logo_url = self._save_logo(request.FILES["logo_file"])
        if str(d.get("remove_logo", "")).lower() == "true":
            e.logo_url = ""
        e.save()
        if old_logo and old_logo != e.logo_url:
            self._delete_local_logo(old_logo)
        return Response({"detail": "Empresa actualizada."})

    def delete(self, request, pk):
        e = self._get(pk)
        if not e:
            return Response({"detail": "Empresa no encontrada."}, status=404)
        e.delete()
        return Response(status=204)


# =============================================================================
# SUPER ADMIN: Métricas del sistema
# =============================================================================

class AdminMetricasView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        from apps.studies.models import Estudio, Solicitud

        total_estudios = Estudio.objects.count()
        por_estado = list(
            Estudio.objects.values("estado").annotate(total=Count("id")).order_by("estado")
        )
        total_empresas = Empresa.objects.count()
        total_usuarios = User.objects.count()
        por_rol = list(
            User.objects.values("rol").annotate(total=Count("id")).order_by("rol")
        )
        estudios_sin_analista = Solicitud.objects.filter(analista__isnull=True).count()

        return Response({
            "total_estudios": total_estudios,
            "por_estado": por_estado,
            "total_empresas": total_empresas,
            "total_usuarios": total_usuarios,
            "por_rol": por_rol,
            "estudios_sin_analista": estudios_sin_analista,
        })


# =============================================================================
# SUPER ADMIN: Asignación de analistas a estudios
# =============================================================================

class AdminAsignarAnalistaView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, estudio_id):
        from apps.studies.models import Estudio
        analista_id = request.data.get("analista_id")
        if not analista_id:
            return Response({"detail": "analista_id es requerido."}, status=400)
        try:
            est = Estudio.objects.select_related("solicitud").get(pk=estudio_id)
        except Estudio.DoesNotExist:
            return Response({"detail": "Estudio no encontrado."}, status=404)
        try:
            analista = User.objects.get(pk=analista_id, rol__in=("ANALISTA", "ADMIN"))
        except User.DoesNotExist:
            return Response({"detail": "Analista no encontrado."}, status=404)

        est.solicitud.analista = analista
        est.solicitud.save(update_fields=["analista"])
        return Response({"detail": f"Analista {analista.username} asignado al estudio #{est.id}."})


# =============================================================================
# SUPER ADMIN: Desbloquear políticas de una empresa
# =============================================================================

class AdminDesbloquearPoliticasView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, empresa_id):
        from apps.studies.models import ClientePoliticaConfiguracion
        try:
            empresa = Empresa.objects.get(pk=empresa_id)
        except Empresa.DoesNotExist:
            return Response({"detail": "Empresa no encontrada."}, status=404)

        actualizadas = ClientePoliticaConfiguracion.objects.filter(
            empresa=empresa, bloqueado=True
        ).update(bloqueado=False)

        return Response({
            "detail": f"Políticas desbloqueadas para {empresa.nombre}.",
            "actualizadas": actualizadas,
        })
