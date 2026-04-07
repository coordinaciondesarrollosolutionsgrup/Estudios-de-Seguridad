from django.db import models
# -------------------- Descripción de la vivienda --------------------
class DescripcionVivienda(models.Model):
    candidato = models.OneToOneField("candidates.Candidato", related_name="descripcion_vivienda", on_delete=models.CASCADE)
    # Primera tabla
    estado_vivienda = models.CharField(max_length=30)
    iluminacion = models.CharField(max_length=20)
    ventilacion = models.CharField(max_length=20)
    aseo = models.CharField(max_length=20)
    # Servicios públicos: puede ser múltiple, pero para simplicidad inicial, como texto
    servicios_publicos = models.CharField(max_length=200)
    # Segunda tabla
    condiciones = models.CharField(max_length=30)
    tenencia = models.CharField(max_length=20)
    tipo_inmueble = models.CharField(max_length=20)
    # Espacios: puede ser múltiple, pero para simplicidad inicial, como texto
    espacios = models.CharField(max_length=200)
    vias_aproximacion = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Descripción vivienda de {self.candidato.nombre} {self.candidato.apellido}"
from django.db import models


class Candidato(models.Model):
    # Básicos
    nombre = models.CharField(max_length=150)
    apellido = models.CharField(max_length=150)
    cedula = models.CharField(max_length=50, unique=True)
    email = models.EmailField()

    # Teléfonos
    celular = models.CharField(max_length=50, blank=True, null=True)
    telefono_fijo = models.CharField(max_length=20, blank=True, null=True)

    ciudad_residencia = models.CharField(max_length=120, blank=True, null=True)

    # Documento
    TIPO_DOC = [
        ("CC", "Cédula de ciudadanía"),
        ("TI", "Tarjeta de identidad"),
        ("CE", "Cédula de extranjería"),
        ("PA", "Pasaporte"),
    ]
    tipo_documento = models.CharField(max_length=2, choices=TIPO_DOC, blank=True, null=True)
    fecha_expedicion = models.DateField(blank=True, null=True)
    lugar_expedicion = models.CharField(max_length=120, blank=True, null=True)
    
     # ---------- NUEVO: Documentos opcionales ----------
    # Libreta militar (opcional)
    libreta_militar_numero = models.CharField(max_length=50, blank=True, null=True)
    libreta_militar_clase = models.CharField(max_length=20, blank=True, null=True)       # p. ej. Primera / Segunda
    libreta_militar_distrito = models.CharField(max_length=80, blank=True, null=True)

    # Licencia de tránsito (opcional)
    licencia_transito_numero = models.CharField(max_length=50, blank=True, null=True)
    licencia_transito_categoria = models.CharField(max_length=10, blank=True, null=True) # A1, A2, B1, ...
    licencia_transito_vence = models.DateField(blank=True, null=True)

    # Bio
    fecha_nacimiento = models.DateField(blank=True, null=True)
    estatura_cm = models.PositiveSmallIntegerField(blank=True, null=True)

    GRUPO_SANG = [("O-","O-"),("O+","O+"),("A-","A-"),("A+","A+"),("B-","B-"),("B+","B+"),("AB-","AB-"),("AB+","AB+")]
    grupo_sanguineo = models.CharField(max_length=3, choices=GRUPO_SANG, blank=True, null=True)

    SEXO = [("M","Masculino"),("F","Femenino"),("X","Otro/No binario")]
    sexo = models.CharField(max_length=1, choices=SEXO, blank=True, null=True)

    ESTADO_CIVIL = [
        ("SOLTERO(A)", "Soltero(a)"),
        ("CASADO(A)", "Casado(a)"),
        ("UNIÓN LIBRE", "Unión libre"),
        ("SEPARADO(A)", "Separado(a)"),
        ("DIVORCIADO(A)", "Divorciado(a)"),
        ("VIUDO(A)", "Viudo(a)"),
    ]
    estado_civil = models.CharField(max_length=20, choices=ESTADO_CIVIL, blank=True, null=True)

    # Campos biográficos adicionales
    nacionalidad = models.CharField(max_length=80, blank=True, null=True)
    discapacidad = models.CharField(max_length=120, blank=True, null=True)
    idiomas = models.CharField(max_length=200, blank=True, null=True, help_text="Idiomas separados por coma")
    estado_migratorio = models.CharField(max_length=120, blank=True, null=True)

    # Dirección
    direccion = models.CharField(max_length=200, blank=True, null=True)
    barrio = models.CharField(max_length=120, blank=True, null=True)
    departamento_id = models.CharField(max_length=20, blank=True, null=True)
    departamento_nombre = models.CharField(max_length=120, blank=True, null=True)
    municipio_id = models.CharField(max_length=20, blank=True, null=True)
    municipio_nombre = models.CharField(max_length=120, blank=True, null=True)
    comuna = models.CharField(max_length=50, blank=True, null=True)

    ESTRATO = [(str(i), f"Estrato {i}") for i in range(1, 7)]
    estrato = models.CharField(max_length=1, choices=ESTRATO, blank=True, null=True)

    TIPO_ZONA = [("URBANO","Urbano"),("RURAL","Rural")]
    tipo_zona = models.CharField(max_length=6, choices=TIPO_ZONA, blank=True, null=True)

    # Seguridad social
    telefono = models.CharField(max_length=50, blank=True, null=True)  # compat: celular 1
    eps = models.CharField(max_length=120, blank=True, null=True)
    caja_compensacion = models.CharField(max_length=120, blank=True, null=True)
    pension_fondo = models.CharField(max_length=120, blank=True, null=True)
    cesantias_fondo = models.CharField(max_length=120, blank=True, null=True)

    # Sisbén
    sisben = models.CharField(max_length=50, blank=True, null=True)
    puntaje_sisben = models.CharField(max_length=4, blank=True, null=True)

    # Otros
    perfil_aspirante = models.TextField(blank=True, null=True)
    redes_sociales = models.JSONField(default=dict, blank=True, null=True)
    estudia_actualmente = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.nombre} {self.apellido} ({self.cedula})"


# ---------- Adjuntos/soportes ----------
def candidato_upload_path(instance, filename):
    # p.ej. candidatos/123/salud/archivo.pdf
    return f"candidatos/{instance.candidato_id}/{instance.tipo.lower()}/{filename}"


class CandidatoSoporte(models.Model):
    TIPOS = [
        # NUEVOS (opcionales)
        ("CEDULA", "Copia cédula"),
        ("LIBRETA_MILITAR", "Libreta militar"),
        ("LICENCIA_TRANSITO", "Licencia de tránsito"),
        
        ("SALUD", "Historial salud/EPS"),
        ("PENSIONES", "Historial pensiones"),
        ("CAJA", "Historial caja de compensación"),
        ("CESANTIAS", "Soporte cesantías"),
        ("FOTO_FRENTE", "Foto frente"),
    ]
    candidato = models.ForeignKey("candidates.Candidato", related_name="soportes", on_delete=models.CASCADE)
    tipo = models.CharField(max_length=20, choices=TIPOS)
    archivo = models.FileField(upload_to=candidato_upload_path)
    creado = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.candidato_id} - {self.tipo}"
    # ...existing code...

# -------------------- Información Familiar --------------------
class InformacionFamiliar(models.Model):
    candidato = models.OneToOneField("candidates.Candidato", related_name="informacion_familiar", on_delete=models.CASCADE)
    estado_civil = models.CharField(max_length=30)
    nombre_pareja = models.CharField(max_length=150, blank=True, null=True)
    ocupacion_pareja = models.CharField(max_length=100, blank=True, null=True)
    empresa_pareja = models.CharField(max_length=150, blank=True, null=True)
    observaciones = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Info familiar de {self.candidato.nombre} {self.candidato.apellido}"

# -------------------- Parientes --------------------
class Pariente(models.Model):
    informacion_familiar = models.ForeignKey("InformacionFamiliar", related_name="parientes", on_delete=models.CASCADE)
    parentesco = models.CharField(max_length=30)
    nombre_apellido = models.CharField(max_length=150)
    ocupacion = models.CharField(max_length=100, blank=True, null=True)
    telefono = models.CharField(max_length=30, blank=True, null=True)
    ciudad = models.CharField(max_length=100, blank=True, null=True)
    vive_con_el = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.parentesco}: {self.nombre_apellido}"

# -------------------- Hijos --------------------
class Hijo(models.Model):
    informacion_familiar = models.ForeignKey("InformacionFamiliar", related_name="hijos", on_delete=models.CASCADE)
    nombre_apellido = models.CharField(max_length=150)
    ocupacion = models.CharField(max_length=100, blank=True, null=True)
    vive_con_el = models.BooleanField(default=False)

    def __str__(self):
        return f"Hijo: {self.nombre_apellido}"

# -------------------- Convivientes --------------------
class Conviviente(models.Model):
    informacion_familiar = models.ForeignKey("InformacionFamiliar", related_name="convivientes", on_delete=models.CASCADE)
    parentesco = models.CharField(max_length=30)
    nombre_apellido = models.CharField(max_length=150)
    ocupacion = models.CharField(max_length=100, blank=True, null=True)
    telefono = models.CharField(max_length=30, blank=True, null=True)

    def __str__(self):
        return f"Conviviente: {self.nombre_apellido}"




