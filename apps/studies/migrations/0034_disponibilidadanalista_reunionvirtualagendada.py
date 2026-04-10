from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("studies", "0033_slotdisponibilidadanalista_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="DisponibilidadAnalista",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("fecha", models.DateField()),
                ("hora_inicio", models.TimeField()),
                ("hora_fin", models.TimeField(editable=False)),
                (
                    "estado",
                    models.CharField(
                        choices=[
                            ("DISPONIBLE", "Disponible"),
                            ("RESERVADO", "Reservado"),
                            ("CANCELADO", "Cancelado"),
                        ],
                        db_index=True,
                        default="DISPONIBLE",
                        max_length=20,
                    ),
                ),
                ("creado_at", models.DateTimeField(auto_now_add=True)),
                (
                    "analista",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="disponibilidades_analista",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "estudio_reservado",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="slot_reunion_global",
                        to="studies.estudio",
                    ),
                ),
            ],
            options={
                "ordering": ["fecha", "hora_inicio"],
                "unique_together": {("analista", "fecha", "hora_inicio")},
            },
        ),
        migrations.CreateModel(
            name="ReunionVirtualAgendada",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "estado",
                    models.CharField(
                        choices=[
                            ("PENDIENTE", "Pendiente"),
                            ("CONFIRMADA", "Confirmada"),
                            ("CANCELADA", "Cancelada"),
                            ("REALIZADA", "Realizada"),
                        ],
                        db_index=True,
                        default="PENDIENTE",
                        max_length=20,
                    ),
                ),
                ("fecha_limite_agendamiento", models.DateField()),
                ("agendado_at", models.DateTimeField(auto_now_add=True)),
                ("cancelado_at", models.DateTimeField(blank=True, null=True)),
                ("nota", models.TextField(blank=True, default="")),
                (
                    "cancelado_por",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="reuniones_canceladas",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "estudio",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reunion_agendada",
                        to="studies.estudio",
                    ),
                ),
                (
                    "slot",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="reunion_agendada",
                        to="studies.disponibilidadanalista",
                    ),
                ),
            ],
            options={
                "ordering": ["-agendado_at"],
            },
        ),
    ]
