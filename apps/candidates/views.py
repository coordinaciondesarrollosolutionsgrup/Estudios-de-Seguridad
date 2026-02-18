from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser

from .models import Candidato, CandidatoSoporte, InformacionFamiliar
from .serializers import CandidatoBioSerializer, CandidatoSoporteSerializer, InformacionFamiliarSerializer
# -------------------- API Información Familiar --------------------
class InformacionFamiliarMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cand = get_candidato_for_user(request)
        info = getattr(cand, "informacion_familiar", None)
        if not info:
            return Response({"detail": "No hay información familiar registrada."}, status=404)
        ser = InformacionFamiliarSerializer(info, context={"request": request})
        return Response(ser.data)


    def post(self, request):
        cand = get_candidato_for_user(request)
        info = getattr(cand, "informacion_familiar", None)
        if info:
            # Si ya existe, actualiza (igual que PATCH)
            ser = InformacionFamiliarSerializer(info, data=request.data, partial=True, context={"request": request})
            ser.is_valid(raise_exception=True)
            ser.save()
            return Response(ser.data, status=200)
        else:
            # Si no existe, crea
            ser = InformacionFamiliarSerializer(data=request.data, context={"request": request})
            ser.is_valid(raise_exception=True)
            obj = ser.save(candidato=cand)
            return Response(InformacionFamiliarSerializer(obj, context={"request": request}).data, status=201)

    # GET eliminado, la lógica es igual a biográfico: solo POST y PATCH

    def patch(self, request):
        cand = get_candidato_for_user(request)
        info = getattr(cand, "informacion_familiar", None)
        if not info:
            return Response({"detail": "No hay información familiar registrada."}, status=404)
        ser = InformacionFamiliarSerializer(info, data=request.data, partial=True, context={"request": request})
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data, status=200)


def get_candidato_for_user(request):
    # Si tu User tiene relación directa: user.candidato
    cand = getattr(request.user, "candidato", None)
    if cand:
        return cand
    # Fallback por email (como tenías)
    return get_object_or_404(Candidato, email=request.user.email)


class CandidatoMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cand = get_candidato_for_user(request)
        ser = CandidatoBioSerializer(cand, context={"request": request})
        return Response(ser.data)

    def patch(self, request):
        cand = get_candidato_for_user(request)
        ser = CandidatoBioSerializer(cand, data=request.data, partial=True, context={"request": request})
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data, status=200)


class CandidatoMeUploadDocView(APIView):
    """
    POST /api/candidatos/me/upload_doc/
      Form-data:
        - kind: SALUD | PENSIONES | CAJA | FOTO_FRENTE | CESANTIAS
        - file: archivo (multipart/form-data)
    """
    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        cand = get_candidato_for_user(request)

        kind = request.data.get("kind")
        file = request.FILES.get("file")

        if not kind or not file:
            return Response({"detail": "Campos 'kind' y 'file' son requeridos."}, status=400)

        # Valida contra choices si existen
        valid_kinds = None
        if hasattr(CandidatoSoporte, "TIPOS"):
            choices = getattr(CandidatoSoporte, "TIPOS")
            valid_kinds = [k for k, _ in choices] if isinstance(choices, (list, tuple)) else list(choices.keys())
        if valid_kinds is not None and kind not in valid_kinds:
            return Response({"detail": "Valor de 'kind' inválido."}, status=400)

        soporte = CandidatoSoporte.objects.create(
            candidato=cand,
            tipo=kind,
            archivo=file,
        )

        # Si suben la foto frontal y tienes campo foto en Candidato, sincronízalo
        if kind == "FOTO_FRENTE" and hasattr(cand, "foto"):
            cand.foto = soporte.archivo
            cand.save(update_fields=["foto"])

        ser = CandidatoSoporteSerializer(soporte, context={"request": request})
        return Response(ser.data, status=status.HTTP_201_CREATED)
