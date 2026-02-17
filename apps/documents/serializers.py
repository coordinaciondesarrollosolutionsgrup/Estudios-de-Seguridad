from rest_framework import serializers
from .models import Documento
import mimetypes

class DocumentoSerializer(serializers.ModelSerializer):
    archivo_url = serializers.SerializerMethodField()
    mime = serializers.SerializerMethodField()

    class Meta:
        model = Documento
        # no incluyo campos que no existen en tu modelo (estado/comentario),
        # el front ya cae en "PENDIENTE" si no vienen.
        fields = [
            "id", "item", "nombre", "archivo", "tipo",
            "subido_por", "created_at",
            "archivo_url", "mime",
        ]
        read_only_fields = ["item", "subido_por", "created_at", "archivo_url", "mime"]

    def get_archivo_url(self, obj):
        req = self.context.get("request")
        try:
            url = obj.archivo.url
        except Exception:
            return None
        return req.build_absolute_uri(url) if req else url

    def get_mime(self, obj):
        return mimetypes.guess_type(getattr(obj.archivo, "name", ""))[0]
    

class DocumentoUploadSerializer(serializers.Serializer):
    candidato_id = serializers.IntegerField()
    tipo = serializers.CharField(max_length=120)
    archivo = serializers.FileField()

    def validate(self, data):
        if not data.get("archivo"):
            raise serializers.ValidationError("archivo requerido")
        return data
