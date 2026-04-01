# apps/accounts/models.py
from django.contrib.auth.models import AbstractUser
from django.db import models

class Empresa(models.Model):
    nombre = models.CharField(max_length=200)
    nit = models.CharField(max_length=50, blank=True)
    email_contacto = models.EmailField(blank=True)
    logo_url = models.URLField(blank=True)

    def __str__(self):
        return self.nombre

class User(AbstractUser):
    class Rol(models.TextChoices):
        ADMIN = "ADMIN"
        CLIENTE = "CLIENTE"
        ANALISTA = "ANALISTA"
        CANDIDATO = "CANDIDATO"
    rol = models.CharField(max_length=20, choices=Rol.choices, default=Rol.ANALISTA)
    empresa = models.ForeignKey("accounts.Empresa", null=True, blank=True,
                                on_delete=models.SET_NULL, related_name="usuarios")
    candidate_access_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Fecha límite de acceso para usuarios con rol CANDIDATO.",
    )

    def __str__(self):
        return f"{self.username} ({self.rol})"
