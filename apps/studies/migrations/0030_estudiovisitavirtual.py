from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("studies", "0029_historialconfiguracion"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="EstudioVisitaVirtual",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("meeting_url", models.URLField(max_length=500)),
                ("estado", models.CharField(choices=[("ACTIVA", "Activa"), ("FINALIZADA", "Finalizada")], default="ACTIVA", max_length=20)),
                ("consentida_por_candidato", models.BooleanField(default=False)),
                ("consentida_at", models.DateTimeField(blank=True, null=True)),
                ("ultima_latitud", models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ("ultima_longitud", models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ("ultima_precision_m", models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ("ultima_actualizacion_at", models.DateTimeField(blank=True, null=True)),
                ("activa_desde", models.DateTimeField(auto_now_add=True)),
                ("finalizada_at", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("creada_por", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="visitas_virtuales_creadas", to=settings.AUTH_USER_MODEL)),
                ("estudio", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="visita_virtual", to="studies.estudio")),
            ],
            options={
                "ordering": ["-activa_desde"],
            },
        ),
    ]
