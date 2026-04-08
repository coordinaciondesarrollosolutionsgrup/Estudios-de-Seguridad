
from django.db import models
from django.utils import timezone
from django.conf import settings

class ClientePoliticaConfiguracion(models.Model):
    empresa = models.ForeignKey('accounts.Empresa', on_delete=models.CASCADE, related_name='politica_configuracion')
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='politica_configuracion')
    criterio = models.CharField(max_length=50)  # Ej: 'delitos', 'residencia', 'transito', 'centrales', 'drogas'
    opcion = models.CharField(max_length=50)    # Ej: 'riñas', 'zonas_perifericas', 'comparendos', etc.
    no_relevante = models.BooleanField(default=True)
    bloqueado = models.BooleanField(default=False)
    creado = models.DateTimeField(auto_now_add=True)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('empresa', 'criterio', 'opcion')

    def __str__(self):
        return f"{self.empresa} - {self.criterio} - {self.opcion} (no relevante: {self.no_relevante})"

# Configuración de ítems/subítems excluidos por cliente
class ClienteConfiguracionFormulario(models.Model):
    empresa = models.ForeignKey('accounts.Empresa', on_delete=models.CASCADE, related_name='configuracion_formulario')
    item = models.CharField(max_length=100)
    subitem = models.CharField(max_length=100)
    excluido = models.BooleanField(default=True)  # Si está excluido, no aparece en formularios
    creado = models.DateTimeField(auto_now_add=True)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('empresa', 'item', 'subitem')

    def __str__(self):
        return f"{self.empresa} excluye {self.subitem} de {self.item}"


class HistorialConfiguracion(models.Model):
    TIPO_CHOICES = [
        ('formulario', 'Formulario'),
        ('politica', 'Política'),
    ]
    empresa = models.ForeignKey('accounts.Empresa', on_delete=models.CASCADE, related_name='historial_configuracion')
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='historial_configuracion')
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES)
    accion = models.CharField(max_length=100)   # Ej: "Excluyó subítem", "Incluyó subítem", "Marcó no relevante"
    item = models.CharField(max_length=100)     # Ej: "BIOGRÁFICOS", "delitos"
    subitem = models.CharField(max_length=100)  # Ej: "fecha de nacimiento", "riñas"
    fecha = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha']

    def __str__(self):
        return f"{self.usuario} - {self.accion} - {self.item}: {self.subitem}"


class EstudioReferencia(models.Model):
    estudio = models.ForeignKey("studies.Estudio", related_name="referencias", on_delete=models.CASCADE)
    nombres   = models.CharField(max_length=120)
    apellidos = models.CharField(max_length=120, blank=True)
    telefono  = models.CharField(max_length=30)
    relacion  = models.CharField(max_length=120, blank=True)   # opcional: amigo, jefe, familiar, etc.
    comentario = models.CharField(max_length=255, blank=True)  # opcional

    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]

    def __str__(self):
        return f"{self.nombres} {self.apellidos} — {self.telefono}"

class Solicitud(models.Model):
    empresa = models.ForeignKey("accounts.Empresa", on_delete=models.CASCADE)
    candidato = models.ForeignKey("candidates.Candidato", on_delete=models.CASCADE)
    analista = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="solicitudes"
    )
    estado = models.CharField(max_length=30, default="CREADA")  # CREADA, EN_PROCESO, COMPLETADA
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Solicitud {self.id} - {self.candidato}"


class EstudioEstado(models.TextChoices):
    EN_CAPTURA   = "EN_CAPTURA", "En captura"
    EN_REVISION  = "EN_REVISION", "En revisión"
    DEVUELTO     = "DEVUELTO", "Devuelto al candidato"
    CERRADO      = "CERRADO", "Cerrado"


class DecisionFinal(models.TextChoices):
    PENDIENTE = "PENDIENTE", "Pendiente"
    APTO      = "APTO", "Apto"
    NO_APTO   = "NO_APTO", "No apto"


class Estudio(models.Model):
    solicitud = models.OneToOneField("studies.Solicitud", on_delete=models.CASCADE, related_name="estudio")
    autorizacion_firmada = models.BooleanField(default=False)
    autorizacion_fecha = models.DateTimeField(null=True, blank=True)
    progreso = models.FloatField(default=0.0)
    score_cuantitativo = models.FloatField(default=0.0)
    nivel_cualitativo = models.CharField(max_length=20, default="BAJO")
    updated_at = models.DateTimeField(auto_now=True)
    a_consideracion_cliente = models.BooleanField(default=False, help_text="Indica si el estudio fue creado bajo configuración personalizada del cliente (criterios no relevantes)")

    estado = models.CharField(max_length=20, choices=EstudioEstado.choices, default=EstudioEstado.EN_CAPTURA, db_index=True)
    enviado_at = models.DateTimeField(null=True, blank=True)
    observacion_analista = models.TextField(blank=True, default="")
    decision_final = models.CharField(max_length=10, choices=DecisionFinal.choices, default=DecisionFinal.PENDIENTE)
    finalizado_at = models.DateTimeField(null=True, blank=True)

    def _nivel_por_score(self, score):
        if score >= 75: return "CRITICO"
        if score >= 50: return "ALTO"
        if score >= 25: return "MEDIO"
        return "BAJO"

    def recalcular(self):
        # Calcular progreso y score considerando todos los ítems
        items = self.items.all()
        total = items.count() or 1
        done = items.filter(estado__in=["VALIDADO","CERRADO"]).count()
        self.progreso = round((done/total)*100.0, 1)
        self.score_cuantitativo = round(sum(i.puntaje for i in items), 1)
        self.nivel_cualitativo = self._nivel_por_score(self.score_cuantitativo)
        self.save()

    @property
    def editable_por_candidato(self) -> bool:
        return self.estado in {EstudioEstado.EN_CAPTURA, EstudioEstado.DEVUELTO}

    def marcar_enviado_por_candidato(self):
        self.estado = EstudioEstado.EN_REVISION
        self.enviado_at = timezone.now()
        self.save(update_fields=["estado", "enviado_at", "updated_at"])

    def devolver_a_candidato(self, observacion: str = ""):
        self.estado = EstudioEstado.DEVUELTO
        self.observacion_analista = (observacion or "").strip()
        self.decision_final = DecisionFinal.PENDIENTE
        self.finalizado_at = None
        self.save(update_fields=["estado", "observacion_analista", "decision_final", "finalizado_at", "updated_at"])

    def cerrar_con_decision(self, decision: str, observacion: str = ""):
        if decision not in (DecisionFinal.APTO, DecisionFinal.NO_APTO):
            raise ValueError("Decisión final inválida")
        self.estado = EstudioEstado.CERRADO
        if observacion:
            self.observacion_analista = observacion
        self.decision_final = decision
        self.finalizado_at = timezone.now()
        self.save(update_fields=["estado", "observacion_analista", "decision_final", "finalizado_at", "updated_at"])


class SlotDisponibilidadAnalista(models.Model):
    """Slot de disponibilidad que el analista ofrece al candidato para agendar la reunión."""
    estudio = models.ForeignKey(
        "studies.Estudio", on_delete=models.CASCADE,
        related_name="slots_disponibilidad"
    )
    fecha = models.DateField()
    hora_inicio = models.TimeField()
    hora_fin = models.TimeField(null=True, blank=True)
    creado_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["fecha", "hora_inicio"]

    def __str__(self):
        return f"Slot {self.fecha} {self.hora_inicio} — estudio #{self.estudio_id}"


class DisponibilidadReunionCandidato(models.Model):
    """Slot seleccionado por el candidato para la reunión virtual."""
    estudio = models.OneToOneField(
        "studies.Estudio", on_delete=models.CASCADE,
        related_name="disponibilidad_reunion"
    )
    slot_seleccionado = models.ForeignKey(
        SlotDisponibilidadAnalista, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="seleccionado_por"
    )
    fecha_propuesta = models.DateField(null=True, blank=True)
    hora_inicio = models.TimeField(null=True, blank=True)
    hora_fin = models.TimeField(null=True, blank=True)
    nota = models.TextField(blank=True, default="")
    creada_at = models.DateTimeField(auto_now_add=True)
    actualizada_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Disponibilidad reunión estudio #{self.estudio_id}"


class VisitaVirtualEstado(models.TextChoices):
    ACTIVA = "ACTIVA", "Activa"
    FINALIZADA = "FINALIZADA", "Finalizada"


class EstudioVisitaVirtual(models.Model):
    estudio = models.OneToOneField("studies.Estudio", on_delete=models.CASCADE, related_name="visita_virtual")
    meeting_url = models.URLField(max_length=500)
    estado = models.CharField(max_length=20, choices=VisitaVirtualEstado.choices, default=VisitaVirtualEstado.ACTIVA)

    consentida_por_candidato = models.BooleanField(default=False)
    consentida_at = models.DateTimeField(null=True, blank=True)

    ultima_latitud = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    ultima_longitud = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    ultima_precision_m = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    ultima_actualizacion_at = models.DateTimeField(null=True, blank=True)

    activa_desde = models.DateTimeField(auto_now_add=True)
    finalizada_at = models.DateTimeField(null=True, blank=True)
    creada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="visitas_virtuales_creadas",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-activa_desde"]

    def __str__(self):
        return f"Visita virtual estudio #{self.estudio_id} ({self.estado})"


class ItemTipo(models.TextChoices):
    LISTAS_RESTRICTIVAS = "LISTAS_RESTRICTIVAS"
    TITULOS_ACADEMICOS = "TITULOS_ACADEMICOS"
    CERT_LABORALES = "CERT_LABORALES"
    VISITA_DOMICILIARIA = "VISITA_DOMICILIARIA"
    ANEXOS_FOTOGRAFICOS = "ANEXOS_FOTOGRAFICOS"
    REFERENCIAS_PERSONALES = "REFERENCIAS_PERSONALES"     # 👈 nuevo
    INFO_PATRIMONIO        = "INFO_PATRIMONIO" 


    
class ReferenciaPersonal(models.Model):
    estudio   = models.ForeignKey("studies.Estudio", related_name="refs_personales", on_delete=models.CASCADE)
    candidato = models.ForeignKey("candidates.Candidato", related_name="refs_personales", on_delete=models.CASCADE)

    nombre   = models.CharField(max_length=255)
    telefono = models.CharField(max_length=50, blank=True)
    ocupacion = models.CharField(max_length=255, blank=True)
    empresa   = models.CharField(max_length=255, blank=True)
    tiempo_conocerse = models.CharField(max_length=120, blank=True)  # ej. "12 años"

    # lo escribe el candidato si quiere
    concepto_sobre_referenciado = models.TextField(blank=True)

    # 👇 este lo escribe el analista desde su vista
    concepto_analista = models.TextField(blank=True)

    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]


class Patrimonio(models.Model):
    estudio   = models.ForeignKey("studies.Estudio", related_name="patrimonios", on_delete=models.CASCADE)
    candidato = models.ForeignKey("candidates.Candidato", related_name="patrimonios", on_delete=models.CASCADE)

    # --- Bienes Inmuebles ---
    inmuebles_propios   = models.BooleanField(null=True, blank=True)
    inmuebles_heredados = models.BooleanField(null=True, blank=True)
    obs_ubicacion = models.CharField(max_length=255, blank=True, default="")  # “Observaciones de Ubicación, Dirección”

    # tipo de inmueble (marque con X)
    tipo_casa        = models.BooleanField(null=True, blank=True)
    tipo_apartamento = models.BooleanField(null=True, blank=True)
    tipo_finca       = models.BooleanField(null=True, blank=True)
    tipo_casa_lote   = models.BooleanField(null=True, blank=True)
    tipo_lote        = models.BooleanField(null=True, blank=True)
    tipo_edificio    = models.BooleanField(null=True, blank=True)
    tipo_otro_consultorio = models.BooleanField(null=True, blank=True)
    tipo_otro_text   = models.CharField(max_length=120, blank=True, default="")

    # --- Bienes Muebles ---
    bm_vehiculo      = models.BooleanField(null=True, blank=True)
    bm_motocicleta   = models.BooleanField(null=True, blank=True)
    bm_bicicleta     = models.BooleanField(null=True, blank=True)
    bm_fideicomiso   = models.BooleanField(null=True, blank=True)
    bm_joyas_arte    = models.BooleanField(null=True, blank=True)
    bm_pc_portatil   = models.BooleanField(null=True, blank=True)
    bm_celular_tablet= models.BooleanField(null=True, blank=True)

    obs_muebles = models.CharField(max_length=255, blank=True, default="")  # “Observaciones de Marca, Modelo, Referencia”

    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]


class EstudioItem(models.Model):
    estudio = models.ForeignKey("studies.Estudio", on_delete=models.CASCADE, related_name="items")
    tipo = models.CharField(max_length=40, choices=ItemTipo.choices)
    estado = models.CharField(max_length=20, default="PENDIENTE")
    puntaje = models.FloatField(default=0.0)
    comentario = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def marcar_validado(self, puntaje=0.0):
        self.estado = "VALIDADO"
        self.puntaje = puntaje
        self.save()
        self.estudio.recalcular()


class ConsentimientoTipo(models.TextChoices):
    GENERAL   = "GENERAL",   "Autorización de tratamiento de datos"
    CENTRALES = "CENTRALES", "Consulta en centrales de riesgo"
    ACADEMICO = "ACADEMICO", "Verificación académica"


class EstudioConsentimiento(models.Model):
    estudio = models.ForeignKey("studies.Estudio", related_name="consentimientos", on_delete=models.CASCADE)
    tipo = models.CharField(max_length=20, choices=ConsentimientoTipo.choices)
    aceptado = models.BooleanField(default=False)
    firmado_at = models.DateTimeField(null=True, blank=True)

    firma = models.FileField(upload_to="firmas/", null=True, blank=True)           # combinada (trazo + imagen)
    firma_draw = models.FileField(upload_to="firmas/", null=True, blank=True)      # solo trazo digital
    firma_imagen = models.FileField(upload_to="firmas/", null=True, blank=True)    # solo imagen subida

    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("estudio", "tipo")

    def __str__(self):
        return f"{self.estudio_id} - {self.tipo} - {'OK' if self.aceptado else 'PENDIENTE'}"


class Academico(models.Model):
    TIPO_ARCHIVO = (
        ("DIPLOMA", "Diploma"),
        ("ACTA", "Acta de grado"),
        ("OTRO", "Otro"),
    )
    CATEGORIA = (
        ("FORMAL", "Formal"),
        ("NO_FORMAL", "No formal"),
    )
    
    # ⬇️ Nuevo: nivel de educación
    NIVEL = (
        ("PRIMARIA", "Primaria"),
        ("SECUNDARIA", "Secundaria"),
        ("BACHILLER", "Bachiller"),
        ("TECNICO", "Técnico"),
        ("TECNOLOGO", "Tecnólogo"),
        ("PROFESIONAL", "Profesional"),
        ("ESPECIALIZACION", "Especialización"),
        ("MAESTRIA", "Maestría"),
        ("DOCTORADO", "Doctorado"),
    )
    nivel = models.CharField(max_length=20, choices=NIVEL, blank=True, null=True)

    # Soportes clásicos (se mantienen):
    archivo = models.FileField(upload_to="academicos/", null=True, blank=True)
    archivo_tipo = models.CharField(max_length=10, choices=TIPO_ARCHIVO, default="DIPLOMA")

    # ⬇️ Nuevos soportes SOLO para educación superior:
    cert_antecedentes = models.FileField(  # Certificado vigencia antecedentes disciplinarios
        upload_to="academicos/", null=True, blank=True
    )
    matricula_archivo = models.FileField(  # Copia de matrícula profesional (si tiene tarjeta)
        upload_to="academicos/", null=True, blank=True
    )

    estudio = models.ForeignKey("studies.Estudio", related_name="academicos", on_delete=models.CASCADE, null=True, blank=True)
    candidato = models.ForeignKey("candidates.Candidato", related_name="academicos", on_delete=models.CASCADE)

    # nuevos
    grado = models.CharField(max_length=120, blank=True, default="")
    acta_numero = models.CharField(max_length=120, blank=True, default="")
    folio_numero = models.CharField(max_length=120, blank=True, default="")
    libro_registro = models.CharField(max_length=120, blank=True, default="")
    rector = models.CharField(max_length=255, blank=True, default="")
    secretario = models.CharField(max_length=255, blank=True, default="")
    concepto = models.TextField(blank=True, default="")
    secretario_general   = models.CharField(max_length=255, blank=True, default="")
    secretario_academico = models.CharField(max_length=255, blank=True, default="")
    jefe_registro        = models.CharField(max_length=255, blank=True, default="")

    titulo = models.CharField(max_length=255)
    institucion = models.CharField(max_length=255)
    fecha_graduacion = models.DateField(null=True, blank=True)
    ciudad = models.CharField(max_length=120, blank=True)
    presenta_original = models.BooleanField(default=False)

    archivo = models.FileField(upload_to="academicos/", null=True, blank=True)
    archivo_tipo = models.CharField(max_length=10, choices=TIPO_ARCHIVO, default="DIPLOMA")
    categoria          = models.CharField(max_length=10, choices=CATEGORIA, default="FORMAL")
    colegio_regulador  = models.CharField(max_length=255, blank=True, default="")
    tiene_matricula    = models.BooleanField(null=True, blank=True)
    matricula_numero   = models.CharField(max_length=60, blank=True, default="")

    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-creado"]

    def __str__(self):
        return f"{self.titulo} · {self.institucion}"


class Laboral(models.Model):
    TIPO_CONTRATO = (
        ("FIJO", "Fijo"),
        ("INDEFINIDO", "Indefinido"),
        ("OBRA", "Obra/Labor"),
        ("PRESTACION", "Prestación de servicios"),   # ← nuevo
        ("APRENDIZAJE", "Aprendizaje"),              # ← nuevo
        ("OTRO", "Otro"),
    )

    estudio = models.ForeignKey("studies.Estudio", related_name="laborales", on_delete=models.CASCADE, null=True, blank=True)
    candidato = models.ForeignKey("candidates.Candidato", related_name="laborales", on_delete=models.CASCADE)

    empresa = models.CharField(max_length=255)
    cargo = models.CharField(max_length=255, blank=True)
    telefono = models.CharField(max_length=100, blank=True)
    email_contacto = models.EmailField(blank=True)
    direccion = models.CharField(max_length=255, blank=True)

    ingreso = models.DateField(null=True, blank=True)
    retiro = models.DateField(null=True, blank=True)
    motivo_retiro = models.CharField(max_length=255, blank=True)

    tipo_contrato = models.CharField(max_length=12, choices=TIPO_CONTRATO, blank=True)
    jefe_inmediato = models.CharField(max_length=255, blank=True)

    referencia_nombre   = models.CharField(max_length=255, blank=True)
    referencia_telefono = models.CharField(max_length=100, blank=True)
    
    verificada_camara = models.BooleanField(default=False)
    volveria_contratar = models.BooleanField(null=True, blank=True)

    concepto = models.TextField(blank=True)

    certificado = models.FileField(upload_to="laborales/", null=True, blank=True)

    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-creado"]

    def __str__(self):
        return f"{self.empresa} · {self.cargo or ''}".strip()


class EstudioDocumento(models.Model):
    CATEGORIAS = [("DOC", "Documento general"), ("CENTRALES", "Centrales de riesgo")]
    SUBIDO_POR = [("CANDIDATO","CANDIDATO"), ("ANALISTA","ANALISTA")]

    estudio = models.ForeignKey("studies.Estudio", on_delete=models.CASCADE, related_name="documentos")
    categoria = models.CharField(max_length=20, choices=CATEGORIAS, default="DOC")
    archivo = models.FileField(upload_to="estudios/%Y/%m/")
    nombre = models.CharField(max_length=255, blank=True)
    subido_por = models.CharField(max_length=10, choices=SUBIDO_POR, default="CANDIDATO")
    creado = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.nombre or self.archivo.name


class Economica(models.Model):
    estudio   = models.ForeignKey("studies.Estudio", on_delete=models.CASCADE, related_name="economicas")
    candidato = models.ForeignKey("candidates.Candidato", on_delete=models.CASCADE, related_name="economicas")

    central            = models.CharField(max_length=120, blank=True)
    registra_negativos = models.BooleanField(null=True, blank=True)
    deuda_actual       = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    productos_financieros = models.JSONField(default=dict, blank=True)  # ⬅️ nuevo


    acuerdo_pago  = models.BooleanField(null=True, blank=True)
    fecha_acuerdo = models.DateField(null=True, blank=True)
    valor_mensual = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    es_codeudor   = models.BooleanField(null=True, blank=True)

    ingresos        = models.JSONField(default=dict, blank=True)
    egresos         = models.JSONField(default=dict, blank=True)
    total_ingresos  = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_egresos   = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    cruce           = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    observaciones = models.TextField(blank=True)
    soporte = models.FileField(upload_to="economica/", blank=True, null=True)

    creado = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Econ {self.id} – Estudio {self.estudio_id}"


# models.py
class AnexoFoto(models.Model):
    class Tipo(models.TextChoices):
        FACHADA_GENERAL   = "FACHADA_GENERAL", "Fachada general"
        FACHADA_POSTERIOR = "FACHADA_POSTERIOR", "Fotografía posterior fachada"
        NOMENCLATURA      = "NOMENCLATURA", "Vista nomenclatura (zoom)"  # ← renombrado
        ENTRADA           = "ENTRADA", "Entrada vivienda"
        FRENTE_ASPIRANTE  = "FRENTE_ASPIRANTE", "Fotografía reciente frente aspirante"  # legado (sigue aceptado)

        SALA_GENERAL   = "SALA_GENERAL", "Vista general sala"
        SALA_POSTERIOR = "SALA_POSTERIOR", "Vista posterior sala"
        COMEDOR        = "COMEDOR", "Comedor"
        COCINA         = "COCINA", "Cocina"
        BANO_1         = "BANO_1", "Baño 1"
        BANO_2         = "BANO_2", "Baño 2"
        ZONA_LAVADO    = "ZONA_LAVADO", "Zona de lavado"
        ESTUDIO        = "ESTUDIO", "Estudio"
        HALL_CORREDOR  = "HALL_CORREDOR", "Hall o corredor"
        ESCALERAS      = "ESCALERAS", "Escaleras"

        # Exteriores / aledañas
        PATIO_1     = "PATIO_1", "Patio 1"
        PATIO_2     = "PATIO_2", "Patio 2"
        BALCON_1    = "BALCON_1", "Balcón 1"
        BALCON_2    = "BALCON_2", "Balcón 2"
        HABITACION_1 = "HABITACION_1", "Habitación 1"
        HABITACION_2 = "HABITACION_2", "Habitación 2"
        HABITACION_3 = "HABITACION_3", "Habitación 3"
        ZONAS_ALED_1 = "ZONAS_ALED_1", "Vista posterior zonas aledañas 1"
        ZONAS_ALED_2 = "ZONAS_ALED_2", "Vista posterior zonas aledañas 2"

        # Conjunto / comunes (se mantienen por compatibilidad, pero el front ya no los usará)
        ZONAS_COMUNES = "ZONAS_COMUNES", "Zonas comunes"
        ZONAS_HUMEDAS = "ZONAS_HUMEDAS", "Zonas húmedas"
        PARQUES       = "PARQUES", "Parques"
        GIMNASIO      = "GIMNASIO", "Gimnasio"
        TERRAZA       = "TERRAZA", "Terraza"
        PARQUEADERO_1 = "PARQUEADERO_1", "Parqueadero 1"
        PARQUEADERO_2 = "PARQUEADERO_2", "Parqueadero 2"

        # 🔴 Nuevos que pide el front
        TORRE      = "TORRE", "Torre"
        RECEPCION  = "RECEPCION", "Recepción"
        ASCENSORES = "ASCENSORES", "Ascensores"
        TURCO      = "TURCO", "Turco"
        SAUNA      = "SAUNA", "Sauna"
        JACUZZI    = "JACUZZI", "Jacuzzi"
        BBQ        = "BBQ", "BBQ"

        # “Otras fotografías” (opcionales)
        OTRAS_1 = "OTRAS_1", "Otras fotografías 1"
        OTRAS_2 = "OTRAS_2", "Otras fotografías 2"
        OTRAS_3 = "OTRAS_3", "Otras fotografías 3"
        OTRAS_4 = "OTRAS_4", "Otras fotografías 4"

        # ♻️ Legados (no romper históricos)
        PATIO_BALCON_1 = "PATIO_BALCON_1", "Patio o balcón 1"
        PATIO_BALCON_2 = "PATIO_BALCON_2", "Patio o balcón 2"

    estudio   = models.ForeignKey("studies.Estudio", on_delete=models.CASCADE, related_name="anexos_foto")
    candidato = models.ForeignKey("candidates.Candidato", on_delete=models.CASCADE, related_name="anexos_foto")

    tipo       = models.CharField(max_length=40, choices=Tipo.choices, db_index=True)
    no_aplica  = models.BooleanField(default=False)
    archivo    = models.ImageField(upload_to="anexos/%Y/%m/", null=True, blank=True)
    comentario = models.CharField(max_length=255, blank=True, default="")
    orden      = models.PositiveIntegerField(default=0)

    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("estudio", "tipo")
        ordering = ["orden", "tipo", "-creado"]

    def __str__(self):
        return f"{self.estudio_id} · {self.get_tipo_display()} · {'N/A' if self.no_aplica else 'OK' if self.archivo else '—'}"


class EvaluacionTrato(models.Model):
    estudio = models.OneToOneField("studies.Estudio", on_delete=models.CASCADE, related_name="evaluacion")
    # ⚠️ usar AUTH_USER_MODEL. No llames get_user_model() aquí.
    candidato_user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)

    answers = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    def is_completed(self):
        return bool(self.submitted_at)
