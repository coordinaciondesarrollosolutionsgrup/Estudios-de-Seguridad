from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("studies", "0035_estudio_habilitado_candidato_at"),
    ]

    operations = [
        migrations.AlterField(
            model_name="reunionvirtualagendada",
            name="slot",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="reuniones_agendadas",
                to="studies.disponibilidadanalista",
            ),
        ),
    ]
