from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("studies", "0036_alter_reunionvirtualagendada_slot"),
    ]

    operations = [
        migrations.AddField(
            model_name="reunionvirtualagendada",
            name="calendar_event_id",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="reunionvirtualagendada",
            name="meeting_url",
            field=models.URLField(blank=True, default="", max_length=500),
        ),
    ]
