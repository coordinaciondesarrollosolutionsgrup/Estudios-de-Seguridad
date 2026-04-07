# apps/studies/serializers.py
from rest_framework import serializers
from django.utils.module_loading import import_string
from apps.candidates.serializers import CandidatoBioSerializer

from .models import (
    Solicitud,
    Estudio,
    EstudioItem,
    EstudioConsentimiento,
    Academico,
    Laboral,
    ItemTipo,
    EstudioDocumento,
    Economica,
    AnexoFoto,
    EvaluacionTrato,
    EstudioReferencia,
    ReferenciaPersonal,
    Patrimonio,
    DisponibilidadReunionCandidato,
)
from apps.candidates.models import Candidato
from apps.accounts.models import Empresa
from .models import ClienteConfiguracionFormulario, ClientePoliticaConfiguracion


# -------------------- Candidato / Solicitud --------------------

class ReferenciaPersonalSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReferenciaPersonal
        fields = ["id","estudio","candidato","nombre","telefono","ocupacion","empresa",
                  "tiempo_conocerse","concepto_sobre_referenciado","concepto_analista","creado"]
        read_only_fields = ["id","candidato","creado"]
        extra_kwargs = {"estudio": {"required": False}}  # ðŸ‘ˆ



class PatrimonioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patrimonio
        fields = "__all__"
        read_only_fields = ["id","candidato","creado"]
        extra_kwargs = {"estudio": {"required": False}}  # ðŸ‘ˆ

        
class EvaluacionTratoSerializer(serializers.ModelSerializer):
    class Meta:
        model = EvaluacionTrato
        fields = ["id", "answers", "created_at", "submitted_at"]
        read_only_fields = ["id", "created_at", "submitted_at"]
        
        
class CandidatoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Candidato
        fields = ["id", "nombre", "apellido", "cedula", "email", "celular", "ciudad_residencia"]

class EconomicaSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Economica
        fields = "__all__"
        read_only_fields = ("id", "candidato", "creado")

class AnexoFotoSerializer(serializers.ModelSerializer):
    archivo_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = AnexoFoto
        fields = [
            "id", "estudio", "candidato", "tipo", "no_aplica",
            "archivo", "archivo_url", "comentario", "orden", "creado",
        ]
        read_only_fields = ("id", "candidato", "creado")

    def get_archivo_url(self, obj):
        f = getattr(obj, "archivo", None)
        req = self.context.get("request")
        return req.build_absolute_uri(f.url) if (f and req) else (getattr(f, "url", None) if f else None)



class SolicitudCreateSerializer(serializers.ModelSerializer):
    candidato = CandidatoSerializer()
    empresa = serializers.PrimaryKeyRelatedField(queryset=Empresa.objects.all(), required=False)

    class Meta:
        model = Solicitud
        fields = ["id", "empresa", "candidato", "analista", "estado", "created_at"]
        read_only_fields = ["id", "estado", "created_at"]

    def create(self, validated_data):
        cand_data = validated_data.pop("candidato")
        empresa = validated_data.pop("empresa", None) or self.context.get("empresa")
        if empresa is None:
            raise serializers.ValidationError({"empresa": ["Empresa no especificada."]})

        cand_data = dict(cand_data)
        cand_data.pop("id", None)
        cedula = (cand_data.get("cedula") or "").strip()
        if not cedula:
            raise serializers.ValidationError({"candidato": {"cedula": ["La cédula es requerida."]}})

        # Reutiliza candidato existente por cédula para soportar nuevos estudios históricos.
        candidato = Candidato.objects.filter(cedula=cedula).first()
        if candidato:
            for field in ("nombre", "apellido", "email", "celular", "ciudad_residencia"):
                val = cand_data.get(field, None)
                if val not in (None, ""):
                    setattr(candidato, field, val)
            candidato.save(update_fields=["nombre", "apellido", "email", "celular", "ciudad_residencia", "updated_at"])
        else:
            candidato = Candidato.objects.create(**cand_data)

        solicitud = Solicitud.objects.create(empresa=empresa, candidato=candidato, **validated_data)
        estudio = Estudio.objects.create(solicitud=solicitud)

        # Crear solo los items/subitems permitidos según la configuración personalizada
        from apps.studies.models import ClienteConfiguracionFormulario, EstudioItem
        ALL_ITEMS = [
            "BIOGRAFICOS", "INFO_FAMILIAR", "VIVIENDA", "ACADEMICO", "LABORAL", "REFERENCIAS",
            "ECONOMICA", "PATRIMONIO", "DOCUMENTOS", "ANEXOS_FOTOGRAFICOS", "LISTAS_RESTRICTIVAS"
        ]
        excluidos = ClienteConfiguracionFormulario.objects.filter(empresa=empresa, excluido=True)
        excluidos_dict = {}
        excluded_modules = set()
        for e in excluidos:
            item_key = (e.item or "").upper().strip()
            if item_key == "ECONOMICO":
                item_key = "ECONOMICA"
            sub_key = (e.subitem or "").upper().strip()
            excluidos_dict.setdefault(item_key, set()).add(sub_key)
            # Marca de exclusión de módulo completo (configurada desde "Arma tu estudio")
            if sub_key == "__ITEM__":
                excluded_modules.add(item_key)

        for item in ALL_ITEMS:
            if item in excluded_modules:
                continue
            EstudioItem.objects.create(estudio=estudio, tipo=item)

        return solicitud


# -------------------- Items del Estudio --------------------
class EstudioItemSerializer(serializers.ModelSerializer):
    documentos = serializers.SerializerMethodField()
    academicos = serializers.SerializerMethodField()
    laborales  = serializers.SerializerMethodField()
    economica = serializers.SerializerMethodField()
    anexos     = serializers.SerializerMethodField()   # <-- NUEVO
    referencias_personales = serializers.SerializerMethodField()
    patrimonio = serializers.SerializerMethodField()



    class Meta:
        model = EstudioItem
        fields = [
            "id", "tipo", "estado", "puntaje", "comentario", "created_at",
            "documentos", "academicos", "laborales","economica","anexos",
            "referencias_personales","patrimonio", 
        ]
    def get_referencias_personales(self, obj):
        if (obj.tipo or "").upper() != "REFERENCIAS_PERSONALES":
            return []
        qs = ReferenciaPersonal.objects.filter(estudio=obj.estudio).order_by("-id")
        return ReferenciaPersonalSerializer(qs, many=True, context=self.context).data

    def get_patrimonio(self, obj):
        if (obj.tipo or "").upper() != "INFO_PATRIMONIO":
            return None
        p = Patrimonio.objects.filter(estudio=obj.estudio).order_by("-id").first()
        return PatrimonioSerializer(p, context=self.context).data if p else None
    
    def get_anexos(self, obj):
        t = (obj.tipo or "").upper()
        esperado = str(getattr(ItemTipo, "VISITA_DOMICILIARIA", "VISITA_DOMICILIARIA")).upper()
        if t != esperado:
            return []

        data = []
        qs = AnexoFoto.objects.filter(estudio=obj.estudio).order_by("orden", "tipo", "-creado")
        for a in qs:
            data.append({
                "id": a.id,
                "tipo": a.tipo,
                "label": a.get_tipo_display(),
                "no_aplica": a.no_aplica,
                "archivo_url": self._abs_url(getattr(a, "archivo", None)),  # ðŸ‘ˆ clave uniforme
                "comentario": a.comentario or "",
            })
        return data


    def get_economica(self, obj):
        # acepta INFO_ECONOMICA o ECONOMICA segÃºn tu Enum
        t = str(getattr(obj, "tipo", "")).upper()
        if t not in {str(getattr(ItemTipo, "INFO_ECONOMICA", "INFO_ECONOMICA")).upper(),
                     str(getattr(ItemTipo, "ECONOMICA", "ECONOMICA")).upper()}:
            return []
        data = []
        for e in Economica.objects.filter(estudio=obj.estudio).order_by("-id"):
            data.append({
                "id": e.id,
                "central": e.central or None,
                "registra_negativos": e.registra_negativos,
                "deuda_actual": e.deuda_actual,
                "observaciones": e.observaciones or "",
                "archivo": self._abs_url(getattr(e, "soporte", None)),
            })
        return data
    # ---------- helpers ----------
    def _abs_url(self, f):
        if not f:
            return None
        req = self.context.get("request")
        return req.build_absolute_uri(f.url) if req else getattr(f, "url", None)

    def _docs_from_estudio_documento(self, obj, incluir_centrales: bool):
        qs = EstudioDocumento.objects.filter(estudio=obj.estudio).order_by("-creado")
        if not incluir_centrales:
            qs = qs.exclude(categoria="CENTRALES")
        out = []
        for d in qs:
            out.append({
                "id": d.id,
                "nombre": d.nombre or (getattr(d.archivo, "name", None) or "archivo"),
                "tipo": d.categoria or "DOC",
                "archivo": self._abs_url(getattr(d, "archivo", None)),
                "url": self._abs_url(getattr(d, "archivo", None)),
                "creado": getattr(d, "creado", None),
            })
        return out

    def _docs_from_legacy_documento(self, obj):
        """Compatibilidad con el modelo legado apps.documents.models.Documento (FK item)."""
        try:
            Documento = import_string("apps.documents.models.Documento")
        except Exception:
            return []
        qs = Documento.objects.filter(item=obj).order_by("-created_at")
        out = []
        for d in qs:
            archivo = getattr(d, "archivo", None)
            out.append({
                "id": d.id,
                "nombre": getattr(d, "nombre", None) or (getattr(archivo, "name", None) or "archivo"),
                "tipo": getattr(d, "tipo", None) or "DOC",
                "archivo": self._abs_url(archivo),
                "url": self._abs_url(archivo),
                "creado": getattr(d, "created_at", None),
            })
        return out

    # ---------- fields ----------
    def get_documentos(self, obj):
        tipo = (str(obj.tipo) or "").upper()
        if tipo in {"DOCS", "DOC", "DOCUMENTOS"}:
            nuevos  = self._docs_from_estudio_documento(obj, incluir_centrales=False)
            legados = self._docs_from_legacy_documento(obj)
            return (nuevos or []) + (legados or [])
        if tipo in {"CENTRALES", "LISTAS_RESTRICTIVAS"}:
            return self._docs_from_estudio_documento(obj, incluir_centrales=True)
        return []

    def _is_tipo(self, obj, *candidatos):
        val = str(getattr(obj, "tipo", "")).upper()
        cands = {str(c).upper() for c in candidatos if c}
        return val in cands

    def get_academicos(self, obj):
        tipo_acad1 = getattr(ItemTipo, "ACADEMICO", "ACADEMICO")
        tipo_acad2 = getattr(ItemTipo, "TITULOS_ACADEMICOS", "TITULOS_ACADEMICOS")
        if not self._is_tipo(obj, tipo_acad1, tipo_acad2):
            return []
        data = []
        qs = Academico.objects.filter(estudio=obj.estudio).order_by("-id")
        for a in qs:
            data.append({
                "id": a.id,
                "nivel": getattr(a, "nivel", None),
                "titulo": getattr(a, "titulo", None),
                "institucion": getattr(a, "institucion", None),
                "ciudad": getattr(a, "ciudad", None),
                "fecha_graduacion": getattr(a, "fecha_graduacion", None),
                "presenta_original": getattr(a, "presenta_original", False),

                # Soporte â€œclÃ¡sicoâ€
                "archivo": self._abs_url(getattr(a, "archivo", None)),
                "archivo_tipo": getattr(a, "archivo_tipo", None),

                # Autoridades acadÃ©micas
                "rector": getattr(a, "rector", ""),
                "secretario_general": getattr(a, "secretario_general", ""),
                "secretario_academico": getattr(a, "secretario_academico", ""),
                "jefe_registro": getattr(a, "jefe_registro", ""),

                # Superior
                "tiene_matricula": getattr(a, "tiene_matricula", None),
                "matricula_numero": getattr(a, "matricula_numero", ""),
                "cert_antecedentes": self._abs_url(getattr(a, "cert_antecedentes", None)),
                "matricula_archivo": self._abs_url(getattr(a, "matricula_archivo", None)),
            })
        return data

    def get_laborales(self, obj):
        # Acepta ambos nombres del enum
        tipo_lab1 = getattr(ItemTipo, "LABORAL", "LABORAL")
        tipo_lab2 = getattr(ItemTipo, "CERT_LABORALES", "CERT_LABORALES")
        if not self._is_tipo(obj, tipo_lab1, tipo_lab2):
            return []
        data = []
        qs = Laboral.objects.filter(estudio=obj.estudio).order_by("-id")
        for l in qs:
            data.append({
                "id": l.id,
                "empresa": getattr(l, "empresa", None),
                "cargo": getattr(l, "cargo", None),
                "ingreso": getattr(l, "ingreso", None),
                "retiro": getattr(l, "retiro", None),
                "telefono": getattr(l, "telefono", None),
                "email_contacto": getattr(l, "email_contacto", None),
                "certificado": self._abs_url(getattr(l, "certificado", None)),
            })
        return data


# -------------------- Estudio --------------------
class EmpresaMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empresa
        fields = ["id", "nombre"]


class CandidatoMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Candidato
        fields = ["id", "nombre", "apellido", "cedula", "email", "celular", "ciudad_residencia"]


class AnalistaMiniSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    email = serializers.EmailField(allow_blank=True, required=False)


class EstudioConsentimientoSerializer(serializers.ModelSerializer):
    firma_url = serializers.SerializerMethodField()
    firma_imagen_url = serializers.SerializerMethodField()

    class Meta:
        model = EstudioConsentimiento
        fields = ["id", "tipo", "aceptado", "firmado_at", "firma_url", "firma_imagen_url"]

    def _abs(self, f):
        if not f:
            return None
        try:
            url = f.url
        except Exception:
            return None
        req = self.context.get("request")
        return req.build_absolute_uri(url) if req and url and not url.startswith("http") else url

    def get_firma_url(self, obj):
        return self._abs(obj.firma)

    def get_firma_imagen_url(self, obj):
        return self._abs(obj.firma_imagen)


POLITICA_LABELS = {
    ("delitos", "procesos_alimentos"): "Procesos de alimentos",
    ("delitos", "rinas"): "RiÃ±as",
    ("residencia", "zonas_perifericas"): "Zonas perifÃ©ricas",
    ("residencia", "sur_ciudad"): "Sur de la ciudad",
    ("residencia", "comunas"): "Comunas",
    ("transito", "comparendos"): "Comparendos",
    ("centrales", "reportes_negativos"): "Reportes negativos",
    ("drogas", "consumo_frecuente"): "Consumo frecuente",
    ("drogas", "consumo_pasado"): "Consumo pasado",
    ("otros", "delitos"): "Otros",
}


class EstudioSerializer(serializers.ModelSerializer):
    solicitud_id = serializers.IntegerField(source="solicitud.id", read_only=True)
    empresa = EmpresaMiniSerializer(source="solicitud.empresa", read_only=True)
    candidato = CandidatoMiniSerializer(source="solicitud.candidato", read_only=True)
    analista = serializers.SerializerMethodField()
    es_propietario = serializers.SerializerMethodField()
    items = EstudioItemSerializer(many=True, read_only=True)
    consentimientos = serializers.SerializerMethodField()
    editable_por_candidato = serializers.SerializerMethodField()
    politicas_no_relevantes = serializers.SerializerMethodField()
    alerta_estudio_recurrente = serializers.SerializerMethodField()
    estudios_previos_count = serializers.SerializerMethodField()
    ultimo_estudio_previo_id = serializers.SerializerMethodField()

    class Meta:
        model = Estudio
        fields = [
            "id", "solicitud_id",
            "empresa", "candidato", "analista", "es_propietario",
            "autorizacion_firmada", "autorizacion_fecha",
            "progreso", "score_cuantitativo", "nivel_cualitativo",
            "estado", "enviado_at", "observacion_analista",
            "decision_final", "finalizado_at",
            "editable_por_candidato",
            "items", "consentimientos",
            "a_consideracion_cliente",
            "politicas_no_relevantes",
            "alerta_estudio_recurrente",
            "estudios_previos_count",
            "ultimo_estudio_previo_id",
        ]
        read_only_fields = fields

    def get_politicas_no_relevantes(self, obj):
        empresa = getattr(getattr(obj, "solicitud", None), "empresa", None)
        if not empresa:
            return []
        politicas = ClientePoliticaConfiguracion.objects.filter(
            empresa=empresa, no_relevante=True
        )
        labels = []
        for p in politicas:
            label = POLITICA_LABELS.get((p.criterio, p.opcion))
            if label:
                labels.append(label)
            else:
                labels.append(f"{p.criterio}: {p.opcion}")
        return labels

    def get_analista(self, obj):
        a = getattr(obj.solicitud, "analista", None)
        if not a:
            return None
        nombre_completo = f"{a.first_name} {a.last_name}".strip() or a.username
        return {"id": a.id, "username": a.username, "nombre": nombre_completo, "email": a.email or ""}

    def get_es_propietario(self, obj):
        request = self.context.get("request")
        if not request:
            return True
        user = request.user
        rol = getattr(user, "rol", None)
        if rol == "ADMIN":
            return True
        if rol == "ANALISTA":
            analista = getattr(obj.solicitud, "analista", None)
            return bool(analista and analista.id == user.id)
        return True

    def get_consentimientos(self, obj):
        qs = obj.consentimientos.all().order_by("tipo")
        return EstudioConsentimientoSerializer(qs, many=True, context=self.context).data

    def get_editable_por_candidato(self, obj):
        # Derivado: editable si NO estÃ¡ en revisiÃ³n ni cerrado
        estado = (getattr(obj, "estado", "") or "").upper()
        return estado not in {"EN_REVISION", "CERRADO"}

    def _previos_qs(self, obj):
        cand_id = getattr(getattr(obj, "solicitud", None), "candidato_id", None)
        if not cand_id:
            return Estudio.objects.none()
        return Estudio.objects.filter(solicitud__candidato_id=cand_id).exclude(pk=obj.pk)

    def get_alerta_estudio_recurrente(self, obj):
        return self._previos_qs(obj).exists()

    def get_estudios_previos_count(self, obj):
        return self._previos_qs(obj).count()

    def get_ultimo_estudio_previo_id(self, obj):
        prev = self._previos_qs(obj).order_by("-solicitud__created_at", "-id").first()
        return prev.id if prev else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        rol = getattr(getattr(request, "user", None), "rol", None)
        if rol == "CLIENTE":
            for it in data.get("items", []):
                it.pop("puntaje", None)
        elif rol == "CANDIDATO":
            data.pop("score_cuantitativo", None)
            data.pop("nivel_cualitativo", None)
        return data


class EstudioClienteListSerializer(serializers.ModelSerializer):
    solicitud_id = serializers.IntegerField(source="solicitud.id", read_only=True)
    empresa = EmpresaMiniSerializer(source="solicitud.empresa", read_only=True)
    candidato = CandidatoMiniSerializer(source="solicitud.candidato", read_only=True)
    analista = serializers.SerializerMethodField()

    class Meta:
        model = Estudio
        fields = [
            "id",
            "solicitud_id",
            "empresa",
            "candidato",
            "analista",
            "progreso",
            "score_cuantitativo",
            "nivel_cualitativo",
            "estado",
            "decision_final",
            "enviado_at",
            "finalizado_at",
            "a_consideracion_cliente",
        ]
        read_only_fields = fields

    def get_analista(self, obj):
        a = getattr(obj.solicitud, "analista", None)
        if not a:
            return None
        nombre_completo = f"{a.first_name} {a.last_name}".strip() or a.username
        return {"id": a.id, "username": a.username, "nombre": nombre_completo, "email": a.email or ""}

# -------------------- CRUD de mÃ³dulos --------------------
class AcademicoSerializer(serializers.ModelSerializer):
    archivo = serializers.FileField(required=False, allow_null=True)
    cert_antecedentes = serializers.FileField(required=False, allow_null=True)
    matricula_archivo = serializers.FileField(required=False, allow_null=True)
    class Meta:
        model = Academico
        fields = "__all__"
        read_only_fields = ("candidato",)

    def validate(self, attrs):
        # Mantiene tu validaciÃ³n previa
        tiene = attrs.get("tiene_matricula",
                          getattr(self.instance, "tiene_matricula", None))
        num = attrs.get("matricula_numero",
                        getattr(self.instance, "matricula_numero", "")) or ""
        if tiene is True and not num.strip():
            raise serializers.ValidationError({
                "matricula_numero": ["Requerido cuando 'tiene_matricula' es verdadero."]
            })

        # â¬‡ï¸ Validaciones nuevas por nivel
        nivel = attrs.get("nivel", getattr(self.instance, "nivel", None))
        superior = {"TECNICO", "TECNOLOGO", "PROFESIONAL", "ESPECIALIZACION", "MAESTRIA", "DOCTORADO"}

        # Primaria/Secundaria/Bachiller â†’ rector y secretario_general obligatorios
        if nivel in {"PRIMARIA", "SECUNDARIA", "BACHILLER"}:
            rector = (attrs.get("rector", getattr(self.instance, "rector", "")) or "").strip()
            secg  = (attrs.get("secretario_general", getattr(self.instance, "secretario_general", "")) or "").strip()
            errs = {}
            if not rector:
                errs["rector"] = ["Requerido en este nivel."]
            if not secg:
                errs["secretario_general"] = ["Requerido en este nivel."]
            if errs:
                raise serializers.ValidationError(errs)
            # secretario_academico y jefe_registro permanecen opcionales

        # EducaciÃ³n superior â†’ exigir certificados
        if nivel in superior:
            # certificado de antecedentes (siempre para superior)
            if not (attrs.get("cert_antecedentes") or getattr(self.instance, "cert_antecedentes", None)):
                raise serializers.ValidationError({
                    "cert_antecedentes": ["Adjunta el certificado de vigencia de antecedentes disciplinarios."]
                })
            # copia matrÃ­cula si tiene tarjeta
            if bool(tiene):
                if not (attrs.get("matricula_archivo") or getattr(self.instance, "matricula_archivo", None)):
                    raise serializers.ValidationError({
                        "matricula_archivo": ["Adjunta la copia de la matrÃ­cula profesional."]
                    })

        return attrs


class LaboralSerializer(serializers.ModelSerializer):
    jefe_telefono = serializers.CharField(
        required=False, allow_blank=True, source="referencia_telefono"
    )
    class Meta:
        model = Laboral
        fields = [
            "id", "estudio", "candidato",
            "empresa", "cargo",
            "telefono", "email_contacto", "direccion",
            "ingreso", "retiro", "motivo_retiro",
            "tipo_contrato",
            "jefe_inmediato", "jefe_telefono",  # ðŸ‘ˆ usamos el alias
            # (ya no exponemos referencia_nombre / referencia_telefono)
            "verificada_camara", "volveria_contratar",
            "concepto", "certificado", "creado",
        ]
        read_only_fields = ["id", "candidato", "creado"]
        extra_kwargs = {"estudio": {"required": False}}


class EstudioReferenciaSerializer(serializers.ModelSerializer):
    class Meta:
        model  = EstudioReferencia
        fields = ["id", "nombres", "apellidos", "telefono", "relacion", "comentario",
                  "creado", "creado_por"]
        read_only_fields = ["id", "creado", "creado_por"]

    def create(self, validated):
        req = self.context.get("request")
        if req and req.user and req.user.is_authenticated:
            validated["creado_por"] = req.user
        return super().create(validated)
    
class EstudioDetalleSerializer(serializers.ModelSerializer):
    solicitud_id = serializers.IntegerField(source="solicitud.id", read_only=True)
    candidato = CandidatoBioSerializer(source="solicitud.candidato", read_only=True)
    items = EstudioItemSerializer(many=True, read_only=True)
    consentimientos = EstudioConsentimientoSerializer(many=True, read_only=True)
    editable_por_candidato = serializers.SerializerMethodField()  # â¬…ï¸ clave

    class Meta:
        model = Estudio
        fields = (
            "id", "solicitud_id", "estado", "progreso",
            "score_cuantitativo", "nivel_cualitativo",
            "enviado_at", "observacion_analista",
            "decision_final", "finalizado_at",
            "candidato",
            "consentimientos", "items",
            "editable_por_candidato",  # â¬…ï¸ incluir aquÃ­
        )
        read_only_fields = fields

    def get_editable_por_candidato(self, obj):
        estado = (getattr(obj, "estado", "") or "").upper()
        return estado not in {"EN_REVISION", "CERRADO"}

    # opcional: mantener la misma ocultaciÃ³n que haces en EstudioSerializer
    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        rol = getattr(getattr(request, "user", None), "rol", None)
        if rol == "CANDIDATO":
            data.pop("score_cuantitativo", None)
            data.pop("nivel_cualitativo", None)
        return data



class ClienteConfiguracionFormularioSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClienteConfiguracionFormulario
        fields = ['id', 'empresa', 'item', 'subitem', 'excluido', 'creado', 'actualizado']
        read_only_fields = ['id', 'empresa', 'creado', 'actualizado']


# Serializer para polÃ­ticas configurables del cliente
from .models import ClientePoliticaConfiguracion, HistorialConfiguracion, DisponibilidadReunionCandidato

class ClientePoliticaConfiguracionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientePoliticaConfiguracion
        fields = [
            'id', 'empresa', 'usuario', 'criterio', 'opcion',
            'no_relevante', 'bloqueado', 'creado', 'actualizado'
        ]
        read_only_fields = ['id', 'empresa', 'usuario', 'bloqueado', 'creado', 'actualizado']


class HistorialConfiguracionSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.SerializerMethodField()

    class Meta:
        model = HistorialConfiguracion
        fields = ['id', 'tipo', 'accion', 'item', 'subitem', 'fecha', 'usuario_nombre']

    def get_usuario_nombre(self, obj):
        return obj.usuario.username if obj.usuario else 'desconocido'


class DisponibilidadReunionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DisponibilidadReunionCandidato
        fields = [
            'id', 'estudio', 'fecha_propuesta', 'hora_inicio',
            'hora_fin', 'nota', 'creada_at', 'actualizada_at',
        ]
        read_only_fields = ['id', 'estudio', 'creada_at', 'actualizada_at']

