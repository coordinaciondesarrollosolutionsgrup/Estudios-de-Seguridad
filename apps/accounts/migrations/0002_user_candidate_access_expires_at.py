from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="candidate_access_expires_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Fecha límite de acceso para usuarios con rol CANDIDATO.",
                null=True,
            ),
        ),
    ]
