from django.db import models
from django.conf import settings

class Notificacion(models.Model):
    TIPO_CHOICES = (
        ("NUEVA_SOLICITUD", "Nueva solicitud"),
        ("OTRO", "Otro"),
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notificaciones")
    tipo = models.CharField(max_length=32, choices=TIPO_CHOICES)
    titulo = models.CharField(max_length=200)
    cuerpo = models.TextField(blank=True)
    solicitud = models.ForeignKey("studies.Solicitud", null=True, blank=True, on_delete=models.CASCADE)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.tipo} → {self.titulo}"
