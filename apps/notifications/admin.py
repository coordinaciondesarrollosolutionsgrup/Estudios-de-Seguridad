from django.contrib import admin
from .models import Notificacion

@admin.register(Notificacion)
class NotificacionAdmin(admin.ModelAdmin):
    list_display = ("user","tipo","titulo","is_read","created_at")
    list_filter = ("tipo","is_read","created_at")
    search_fields = ("titulo","cuerpo","user__username","solicitud__id")
