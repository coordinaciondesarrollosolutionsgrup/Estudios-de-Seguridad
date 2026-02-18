from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()

class Command(BaseCommand):
    help = 'Crea usuarios iniciales para el sistema'

    def handle(self, *args, **kwargs):
        users = [
            {"username": "admin", "email": "admin@correo.com", "password": "admin1234", "is_superuser": True, "is_staff": True, "rol": "ADMIN"},
            {"username": "admin2", "email": "admin2@correo.com", "password": "admin2123", "is_superuser": False, "is_staff": True, "rol": "ADMIN"},
            {"username": "analista1", "email": "analista1@correo.com", "password": "analista123", "is_superuser": False, "is_staff": True, "rol": "ANALISTA"},
            {"username": "cliente1", "email": "cliente1@correo.com", "password": "cliente123", "is_superuser": False, "is_staff": False, "rol": "CLIENTE"},
            {"username": "cliente2", "email": "cliente2@correo.com", "password": "cliente2123", "is_superuser": False, "is_staff": False, "rol": "CLIENTE"},
            {"username": "candidato1", "email": "candidato1@correo.com", "password": "candidato123", "is_superuser": False, "is_staff": False, "rol": "CANDIDATO"},
        ]
        for u in users:
            if not User.objects.filter(username=u["username"]).exists():
                user = User.objects.create_user(
                    username=u["username"],
                    email=u["email"],
                    password=u["password"],
                    rol=u["rol"]
                )
                user.is_superuser = u["is_superuser"]
                user.is_staff = u["is_staff"]
                user.save()
                self.stdout.write(self.style.SUCCESS(f'Usuario creado: {u["username"]}'))
            else:
                self.stdout.write(self.style.WARNING(f'Usuario ya existe: {u["username"]}'))
