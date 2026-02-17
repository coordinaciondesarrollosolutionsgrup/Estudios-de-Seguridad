from rest_framework import serializers
from .models import Notificacion

class NotificacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notificacion
        fields = ["id", "tipo", "titulo", "cuerpo", "is_read", "created_at", "solicitud"]
