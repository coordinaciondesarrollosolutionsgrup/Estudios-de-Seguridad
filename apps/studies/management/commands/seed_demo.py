from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from apps.accounts.models import Empresa
from apps.candidates.models import Candidato
from apps.studies.models import Solicitud, Estudio, EstudioItem, ItemTipo

class Command(BaseCommand):
    help = "Crea datos de ejemplo (empresa, usuarios, candidato, solicitud, estudio e items)."

    def handle(self, *args, **options):
        User = get_user_model()

        # Empresa
        empresa, _ = Empresa.objects.get_or_create(
            nombre="Acme S.A.",
            defaults={"nit": "900000000-1", "email_contacto": "cliente@acme.com"}
        )

        # Usuarios (crear/actualizar SIEMPRE password y campos)
        demo_users = [
            {"username": "admin_demo",     "rol": "ADMIN",    "email": "admin@demo.com",    "pwd": "admin123",    "empresa": None},
            {"username": "cliente_demo",   "rol": "CLIENTE",  "email": "cliente@acme.com",  "pwd": "cliente123",  "empresa": empresa},
            {"username": "analista_demo",  "rol": "ANALISTA", "email": "analista@demo.com", "pwd": "analista123", "empresa": None},
            # Usuario candidato que usas para el login en el front:
            {"username": "candidato_demo", "rol": "CANDIDATO","email": "juan@demo.com",     "pwd": "candidato123","empresa": None},
        ]

        for u in demo_users:
            user, _ = User.objects.get_or_create(username=u["username"])
            user.rol = u["rol"]
            user.email = u["email"]
            user.is_active = True
            if u["empresa"]:
                user.empresa = u["empresa"]
            user.set_password(u["pwd"])   # SIEMPRE re-asigna la contraseña para evitar dudas
            user.save()

        # Candidato del estudio (coincide email con candidato_demo)
        candidato, _ = Candidato.objects.get_or_create(
            cedula="1234567890",
            defaults={
                "nombre": "Juan", "apellido": "Pérez", "email": "juan@demo.com",
                "celular": "3000000000", "ciudad_residencia": "Bogotá"
            }
        )

        # Solicitud + Estudio + Ítems
        analista_user = User.objects.get(username="analista_demo")
        solicitud, _ = Solicitud.objects.get_or_create(empresa=empresa, candidato=candidato, defaults={"analista": analista_user})
        estudio, _ = Estudio.objects.get_or_create(solicitud=solicitud)

        for tipo in [
            ItemTipo.LISTAS_RESTRICTIVAS,
            ItemTipo.TITULOS_ACADEMICOS,
            ItemTipo.CERT_LABORALES,
            ItemTipo.VISITA_DOMICILIARIA,
        ]:
            EstudioItem.objects.get_or_create(estudio=estudio, tipo=tipo)

        self.stdout.write(self.style.SUCCESS("Seed demo actualizado:"))
        self.stdout.write("- Users: admin_demo/admin123, cliente_demo/cliente123, analista_demo/analista123, candidato_demo/candidato123")
        self.stdout.write("- Candidato: 1234567890 (Juan Pérez, juan@demo.com)")
        self.stdout.write("- Solicitud y Estudio con 4 ítems creados")
