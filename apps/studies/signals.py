# apps/studies/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.core.mail import send_mail
from django.conf import settings
import logging
from django.template.loader import render_to_string

from .models import Solicitud, EstudioItem, Estudio, EstudioConsentimiento, ConsentimientoTipo

logger = logging.getLogger(__name__)

@receiver(post_save, sender=Solicitud)
def notificar_solicitud_creada(sender, instance: Solicitud, created, **kwargs):
    if not created:
        return

    asunto = f"Nueva solicitud de estudio #{instance.id}"
    destinatarios = []
    # Correo para analista
    if instance.analista and instance.analista.email:
        destinatarios.append(instance.analista.email)
    # Correo para candidato
    if instance.candidato.email:
        destinatarios.append(instance.candidato.email)
    # Correo para cliente (empresa)
    email_cliente = getattr(instance.empresa, "email_contacto", None)
    if email_cliente:
        destinatarios.append(email_cliente)

    if not destinatarios:
        return

    # Mensaje para todos
    mensaje = f"Se ha creado la solicitud #{instance.id} para el candidato {instance.candidato.nombre} {instance.candidato.apellido} (Cédula: {instance.candidato.cedula})."

    # Mensaje formal para el cliente (con plantilla HTML)
    if email_cliente:
        context = {
            "subject": asunto,
            "nombre": instance.candidato.nombre,
            "cedula": instance.candidato.cedula,
            "solicitud_id": instance.id,
            "estado": "Creada"
        }
        mensaje_html = render_to_string("emails/solicitud_creada.html", context)
        mensaje_txt = render_to_string("emails/solicitud_creada.txt", context)
        try:
            send_mail(
                asunto,
                mensaje_txt,
                getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@estudio.local"),
                [email_cliente],
                html_message=mensaje_html,
                fail_silently=True,
            )
        except Exception:
            logger.exception("Error enviando correo de solicitud al cliente %s", instance.pk)

    # Enviar a analista y candidato (mensaje general con plantilla HTML)
    otros_destinatarios = [d for d in destinatarios if d != email_cliente]
    if otros_destinatarios:
        for destinatario in otros_destinatarios:
            context = {
                "subject": asunto,
                "saludo": f"Hola,",
                "mensaje": mensaje
            }
            mensaje_html = render_to_string("emails/notificacion_general.html", context)
            mensaje_txt = render_to_string("emails/notificacion_general.txt", context)
            try:
                send_mail(
                    asunto,
                    mensaje_txt,
                    getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@estudio.local"),
                    [destinatario],
                    html_message=mensaje_html,
                    fail_silently=True,
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
        destinatarios = []
        email_cliente = getattr(solicitud.empresa, "email_contacto", None)
        if email_cliente:
            destinatarios.append(email_cliente)
        if solicitud.candidato.email:
            destinatarios.append(solicitud.candidato.email)

        if not destinatarios:
            return

        mensaje = f"El ítem {instance.tipo} fue validado. Progreso actual: {estudio.progreso}%."

        # Mensaje formal para el cliente (con plantilla HTML)
        if email_cliente:
            context = {
                "subject": asunto,
                "tipo": instance.tipo,
                "estudio_id": estudio.id,
                "nombre": solicitud.candidato.nombre,
                "cedula": solicitud.candidato.cedula,
                "progreso": estudio.progreso
            }
            mensaje_html = render_to_string("emails/item_validado.html", context)
            mensaje_txt = render_to_string("emails/item_validado.txt", context)
            try:
                send_mail(
                    asunto,
                    mensaje_txt,
                    getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@estudio.local"),
                    [email_cliente],
                    html_message=mensaje_html,
                    fail_silently=True,
                )
            except Exception:
                logger.exception("Error enviando correo de item validado al cliente %s", estudio.pk)

        otros_destinatarios = [d for d in destinatarios if d != email_cliente]
        if otros_destinatarios:
            for destinatario in otros_destinatarios:
                context = {
                    "subject": asunto,
                    "saludo": f"Hola,",
                    "mensaje": mensaje
                }
                mensaje_html = render_to_string("emails/notificacion_general.html", context)
                mensaje_txt = render_to_string("emails/notificacion_general.txt", context)
                try:
                    send_mail(
                        asunto,
                        mensaje_txt,
                        getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@estudio.local"),
                        [destinatario],
                        html_message=mensaje_html,
                        fail_silently=True,
                    )
                except Exception:
                    logger.exception("Error enviando correo de item validado estudio %s", estudio.pk)

@receiver(post_save, sender=Estudio)
def crear_consentimientos(sender, instance, created, **kwargs):
    if not created:
        return
    for t in (ConsentimientoTipo.GENERAL, ConsentimientoTipo.CENTRALES, ConsentimientoTipo.ACADEMICO):
        EstudioConsentimiento.objects.get_or_create(estudio=instance, tipo=t)
