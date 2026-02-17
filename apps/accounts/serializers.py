# apps/accounts/serializers.py
from rest_framework import serializers
from .models import User

class MeSerializer(serializers.ModelSerializer):
    empresa_id = serializers.IntegerField(source="empresa.id", read_only=True, allow_null=True)
    empresa_nombre = serializers.CharField(source="empresa.nombre", read_only=True, allow_null=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "rol", "empresa_id", "empresa_nombre"]
