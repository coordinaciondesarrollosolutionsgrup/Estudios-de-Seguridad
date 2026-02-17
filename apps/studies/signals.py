# apps/studies/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.core.mail import send_mail
from django.conf import settings
import logging

from .models import Solicitud, EstudioItem, Estudio, EstudioConsentimiento, ConsentimientoTipo

logger = logging.getLogger(__name__)

@receiver(post_save, sender=Solicitud)
def notificar_solicitud_creada(sender, instance: Solicitud, created, **kwargs):
    if not created:
        return

    asunto = f"Nueva solicitud de estudio #{instance.id}"
    mensaje = f"Se ha creado la solicitud #{instance.id} para el candidato {instance.candidato}."
    destinatarios = []
    if instance.analista and instance.analista.email:
        destinatarios.append(instance.analista.email)
    if instance.candidato.email:
        destinatarios.append(instance.candidato.email)

    if not destinatarios:
        return

    try:
        send_mail(
            asunto,
            mensaje,
            getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@estudio.local"),
            destinatarios,
            fail_silently=True,   # ← evita 500 si el SMTP falla
        )
    except Exception:
        logger.exception("Error enviando correo de solicitud %s", instance.pk)

@receiver(post_save, sender=EstudioItem)
def notificar_item_validado(sender, instance: EstudioItem, created, **kwargs):
    if created:
        return
    if instance.estado == "VALIDADO":
        estudio = instance.estudio
        solicitud = estudio.solicitud
        asunto = f"Ítem validado en estudio #{estudio.id}"
        mensaje = f"El ítem {instance.tipo} fue validado. Progreso actual: {estudio.progreso}%."
        destinatarios = []
        if getattr(solicitud.empresa, "email_contacto", None):
            destinatarios.append(solicitud.empresa.email_contacto)
        if solicitud.candidato.email:
            destinatarios.append(solicitud.candidato.email)

        if not destinatarios:
            return

        try:
            send_mail(
                asunto,
                mensaje,
                getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@estudio.local"),
                destinatarios,
                fail_silently=True,  # ← idem
            )
        except Exception:
            logger.exception("Error enviando correo de item validado estudio %s", estudio.pk)

@receiver(post_save, sender=Estudio)
def crear_consentimientos(sender, instance, created, **kwargs):
    if not created:
        return
    for t in (ConsentimientoTipo.GENERAL, ConsentimientoTipo.CENTRALES, ConsentimientoTipo.ACADEMICO):
        EstudioConsentimiento.objects.get_or_create(estudio=instance, tipo=t)
