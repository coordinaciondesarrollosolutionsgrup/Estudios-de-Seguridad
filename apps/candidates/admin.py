# apps/candidates/admin.py
from django.contrib import admin
from .models import Candidato

@admin.register(Candidato)
class CandidatoAdmin(admin.ModelAdmin):
    list_display = ('id','nombre','apellido','cedula','email','created_at')
    search_fields = ('cedula','nombre','apellido','email')
