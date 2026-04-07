from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_user_candidate_access_expires_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="empresa",
            name="logo_url",
            field=models.URLField(blank=True),
        ),
    ]

