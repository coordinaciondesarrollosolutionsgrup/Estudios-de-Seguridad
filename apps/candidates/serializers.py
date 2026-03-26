# -------------------- Serializador Descripción de la vivienda --------------------
from rest_framework import serializers
from .models import DescripcionVivienda, Candidato, CandidatoSoporte, InformacionFamiliar, Pariente, Hijo, Conviviente

class DescripcionViviendaSerializer(serializers.ModelSerializer):
    class Meta:
        model = DescripcionVivienda
        fields = [
            "id", "estado_vivienda", "iluminacion", "ventilacion", "aseo", "servicios_publicos",
            "condiciones", "tenencia", "tipo_inmueble", "espacios", "vias_aproximacion",
            "created_at", "updated_at"
        ]
# -------------------- Serializadores Información Familiar --------------------
class ParienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pariente
        fields = ["id", "parentesco", "nombre_apellido", "ocupacion", "telefono", "ciudad", "vive_con_el"]

class HijoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hijo
        fields = ["id", "nombre_apellido", "ocupacion", "vive_con_el"]

class ConvivienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conviviente
        fields = ["id", "parentesco", "nombre_apellido", "ocupacion", "telefono"]

class InformacionFamiliarSerializer(serializers.ModelSerializer):
    parientes = ParienteSerializer(many=True)
    hijos = HijoSerializer(many=True, required=False)
    convivientes = ConvivienteSerializer(many=True, required=False)

    class Meta:
        model = InformacionFamiliar
        fields = [
            "id", "estado_civil", "nombre_pareja", "ocupacion_pareja", "empresa_pareja", "observaciones",
            "parientes", "hijos", "convivientes", "created_at", "updated_at"
        ]

    def validate(self, data):
        # Validar que estado_civil no esté vacío
        if not data.get("estado_civil"):
            raise serializers.ValidationError({"estado_civil": "Este campo es obligatorio."})
        # Ya no se exige al menos un pariente
        return data

    def create(self, validated_data):
        parientes_data = validated_data.pop("parientes", [])
        hijos_data = validated_data.pop("hijos", [])
        convivientes_data = validated_data.pop("convivientes", [])
        info = InformacionFamiliar.objects.create(**validated_data)
        for pariente in parientes_data:
            Pariente.objects.create(informacion_familiar=info, **pariente)
        for hijo in hijos_data:
            Hijo.objects.create(informacion_familiar=info, **hijo)
        for conviviente in convivientes_data:
            Conviviente.objects.create(informacion_familiar=info, **conviviente)
        return info

    def update(self, instance, validated_data):
        parientes_data = validated_data.pop("parientes", [])
        hijos_data = validated_data.pop("hijos", [])
        convivientes_data = validated_data.pop("convivientes", [])
        # Actualizar campos simples
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        # Actualizar parientes
        instance.parientes.all().delete()
        for pariente in parientes_data:
            Pariente.objects.create(informacion_familiar=instance, **pariente)
        # Actualizar hijos
        instance.hijos.all().delete()
        for hijo in hijos_data:
            Hijo.objects.create(informacion_familiar=instance, **hijo)
        # Actualizar convivientes
        instance.convivientes.all().delete()
        for conviviente in convivientes_data:
            Conviviente.objects.create(informacion_familiar=instance, **conviviente)
        return instance


class CandidatoSoporteSerializer(serializers.ModelSerializer):
        url = serializers.SerializerMethodField()

        class Meta:
            model = CandidatoSoporte
            fields = ["id", "tipo", "archivo", "url", "creado"]

        def get_url(self, obj):
            # Devuelve URL absoluta si hay request en el contexto, si no, relativa
            try:
                raw = obj.archivo.url if getattr(obj, "archivo", None) else None
            except Exception:
                raw = None
            request = self.context.get("request")
            return request.build_absolute_uri(raw) if (request and raw) else raw


class CandidatoBioSerializer(serializers.ModelSerializer):
    # Labels legibles
    tipo_documento_label = serializers.CharField(source="get_tipo_documento_display", read_only=True)
    sexo_label           = serializers.CharField(source="get_sexo_display", read_only=True)
    estado_civil_label   = serializers.CharField(source="get_estado_civil_display", read_only=True)
    estrato_label        = serializers.CharField(source="get_estrato_display", read_only=True)
    tipo_zona_label      = serializers.CharField(source="get_tipo_zona_display", read_only=True)

    # Fallbacks útiles
    municipio      = serializers.SerializerMethodField()
    departamento   = serializers.SerializerMethodField()

    foto_url = serializers.SerializerMethodField()
    soportes = serializers.SerializerMethodField()

    class Meta:
        model = Candidato
        fields = [
            "id",
            "nombre","apellido","cedula","email",
            "celular","telefono_fijo","ciudad_residencia",
            "tipo_documento","tipo_documento_label",
            "fecha_nacimiento","estatura_cm",
            "grupo_sanguineo","sexo","sexo_label","estado_civil","estado_civil_label",
            "fecha_expedicion","lugar_expedicion",

            # nuevos campos biográficos
            "nacionalidad","discapacidad","idiomas","estado_migratorio",

            # opcionales
            "libreta_militar_numero","libreta_militar_clase","libreta_militar_distrito",
            "licencia_transito_numero","licencia_transito_categoria","licencia_transito_vence",

            # ubicación (originales)
            "direccion","barrio",
            "departamento_id","departamento_nombre",
            "municipio_id","municipio_nombre",
            "comuna","estrato","estrato_label","tipo_zona","tipo_zona_label",

            # seg. social
            "telefono","eps","caja_compensacion","pension_fondo","cesantias_fondo",

            # sisbén
            "sisben","puntaje_sisben",

            "perfil_aspirante","redes_sociales","estudia_actualmente",
            "created_at","updated_at",

            # nuevos auxiliares
            "municipio","departamento",
            "foto_url","soportes",
        ]

    def get_municipio(self, obj):
        return obj.municipio_nombre or obj.ciudad_residencia or None

    def get_departamento(self, obj):
        return obj.departamento_nombre or None

    def get_foto_url(self, obj):
        request = self.context.get("request")
        url = None
        try:
            if hasattr(obj, "foto") and getattr(obj, "foto"):
                url = obj.foto.url
            else:
                s = obj.soportes.filter(tipo="FOTO_FRENTE").order_by("-id").first()
                if s and getattr(s, "archivo", None):
                    url = s.archivo.url
        except Exception:
            url = None
        return request.build_absolute_uri(url) if (request and url) else url

    def get_soportes(self, obj):
        request = self.context.get("request")
        out = {}
        try:
            qs = obj.soportes.all()
        except Exception:
            qs = []

        last_by_tipo = {}
        for s in qs:
            if s.tipo not in last_by_tipo or s.id > last_by_tipo[s.tipo].id:
                last_by_tipo[s.tipo] = s

        for tipo in ["SALUD","CAJA","PENSIONES","CESANTIAS","FOTO_FRENTE","CEDULA","LIBRETA_MILITAR","LICENCIA_TRANSITO"]:
            s = last_by_tipo.get(tipo)
            try:
                raw = s.archivo.url if s and getattr(s, "archivo", None) else None
            except Exception:
                raw = None
            if raw:
                out[tipo] = request.build_absolute_uri(raw) if request else raw
        return out
