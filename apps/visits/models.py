# apps/visits/models.py
from django.db import models

class VisitaDomiciliaria(models.Model):
    estudio_item = models.OneToOneField("studies.EstudioItem", on_delete=models.CASCADE, related_name="visita")
    tipo_inmueble = models.CharField(max_length=30, blank=True)
    habitaciones = models.IntegerField(default=0)
    banos = models.IntegerField(default=0)
    via_aproximacion = models.CharField(max_length=120, blank=True)
    nomenclatura = models.CharField(max_length=120, blank=True)
    riesgo = models.IntegerField(default=0)
    comentario = models.TextField(blank=True)

class FotoVisita(models.Model):
    visita = models.ForeignKey("visits.VisitaDomiciliaria", on_delete=models.CASCADE, related_name="fotos")
    imagen = models.FileField(upload_to="visitas/")
    etiqueta = models.CharField(max_length=60, blank=True)
    