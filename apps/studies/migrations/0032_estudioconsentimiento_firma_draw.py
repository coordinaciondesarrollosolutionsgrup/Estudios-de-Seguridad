from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("studies", "0031_disponibilidadreuncioncandidato"),
    ]

    operations = [
        migrations.AddField(
            model_name="estudioconsentimiento",
            name="firma_draw",
            field=models.FileField(blank=True, null=True, upload_to="firmas/"),
        ),
    ]
