from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("studies", "0030_estudiovisitavirtual"),
    ]

    operations = [
        migrations.CreateModel(
            name="DisponibilidadReunionCandidato",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("fecha_propuesta", models.DateField(blank=True, null=True)),
                ("hora_inicio", models.TimeField(blank=True, null=True)),
                ("hora_fin", models.TimeField(blank=True, null=True)),
                ("nota", models.TextField(blank=True, default="")),
                ("creada_at", models.DateTimeField(auto_now_add=True)),
                ("actualizada_at", models.DateTimeField(auto_now=True)),
                ("estudio", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="disponibilidad_reunion",
                    to="studies.estudio",
                )),
            ],
        ),
    ]
