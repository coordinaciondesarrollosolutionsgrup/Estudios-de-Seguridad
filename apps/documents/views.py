# apps/documents/views.py
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.exceptions import ValidationError

from .models import Documento
from .serializers import DocumentoSerializer, DocumentoUploadSerializer
from apps.studies.models import Estudio, EstudioItem


class DocumentoViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentoSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    queryset = (
        Documento.objects
        .select_related("item", "item__estudio", "item__estudio__solicitud", "subido_por")
        .order_by("-created_at")
    )

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Documento.objects.none()
        return super().get_queryset().filter(
            item__estudio__solicitud__candidato__email=user.email
        )

    # 🔧 Importante: inyectar "nombre" antes de validar (evita el 400)
    def create(self, request, *args, **kwargs):
        data = request.data.copy()  # QueryDict -> mutable
        f = request.FILES.get("archivo")
        if f and not data.get("nombre"):
            data["nombre"] = f.name  # default

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        user = self.request.user
        if not user.is_authenticated:
            raise ValidationError({"detail": "No autenticado."})

        est = (
            Estudio.objects
            .filter(solicitud__candidato__email=user.email)
            .order_by("-solicitud__created_at")
            .first()
        )
        if not est:
            raise ValidationError({"detail": "No se encontró un estudio activo."})

        # Un contenedor para documentos
        item, _ = EstudioItem.objects.get_or_create(estudio=est, tipo="DOCS")

        # Archivo obligatorio
        f = self.request.FILES.get("archivo")
        if not f:
            raise ValidationError({"archivo": ["Este campo es requerido."]})

        # Si el serializer ya trae 'nombre' y 'tipo', perfecto; si no, caen estos defaults
        nombre = self.request.data.get("nombre") or f.name
        doc_tipo = self.request.data.get("tipo") or ""

        serializer.save(item=item, nombre=nombre, tipo=doc_tipo, subido_por=user)


