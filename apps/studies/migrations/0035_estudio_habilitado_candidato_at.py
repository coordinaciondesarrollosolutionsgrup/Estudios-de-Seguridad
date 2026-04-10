from django.db import migrations, models


def backfill_habilitado_candidato_at(apps, schema_editor):
    Estudio = apps.get_model("studies", "Estudio")
    for estudio in Estudio.objects.filter(habilitado_candidato_at__isnull=True, enviado_at__isnull=False):
        estudio.habilitado_candidato_at = estudio.enviado_at
        estudio.save(update_fields=["habilitado_candidato_at"])


class Migration(migrations.Migration):

    dependencies = [
        ("studies", "0034_disponibilidadanalista_reunionvirtualagendada"),
    ]

    operations = [
        migrations.AddField(
            model_name="estudio",
            name="habilitado_candidato_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_habilitado_candidato_at, migrations.RunPython.noop),
    ]
