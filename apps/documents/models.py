from django.db import models

class Documento(models.Model):
    item = models.ForeignKey("studies.EstudioItem", on_delete=models.CASCADE, related_name="documentos")
    nombre = models.CharField(max_length=150)
    archivo = models.FileField(upload_to="documentos/")
    tipo = models.CharField(max_length=60, blank=True)  # diploma, acta, cert_lab, etc.
    subido_por = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
