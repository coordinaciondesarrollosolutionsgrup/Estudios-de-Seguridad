from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Empresa

@admin.register(Empresa)
class EmpresaAdmin(admin.ModelAdmin):
    list_display = ("nombre", "nit", "email_contacto")
    search_fields = ("nombre", "nit", "email_contacto")

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    # añade nuestros campos al admin de Django
    fieldsets = BaseUserAdmin.fieldsets + (
        ("Rol / Empresa", {"fields": ("rol", "empresa")}),
    )
    list_display = ("username", "email", "rol", "empresa", "is_staff", "is_superuser")
    list_filter  = ("rol", "empresa", "is_staff", "is_superuser")
    search_fields = ("username", "email")
