# apps/studies/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.core.mail import send_mail
from django.conf import settings
import logging
from django.template.loader import render_to_string

from .models import Solicitud, EstudioItem, Estudio, EstudioConsentimiento, ConsentimientoTipo, ClientePoliticaConfiguracion

logger = logging.getLogger(__name__)

# notificar_solicitud_creada eliminado: el envío al analista se realiza desde views.py
# con el contexto correcto para evitar correos duplicados con campos vacíos.

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


@receiver(post_save, sender=Estudio)
def notificar_estudio_consideracion_cliente(sender, instance, created, **kwargs):
    """Notifica al analista y candidato cuando un estudio se crea bajo consideración del cliente."""
    if not created or not instance.a_consideracion_cliente:
        return

    solicitud = getattr(instance, 'solicitud', None)
    if not solicitud:
        return

    asunto = f"Estudio #{instance.id} creado bajo consideración del cliente"
    mensaje = (
        f"El estudio #{instance.id} para el candidato {solicitud.candidato.nombre} "
        f"{solicitud.candidato.apellido} fue creado bajo configuración personalizada del cliente. "
        f"Los criterios marcados como no relevantes por el cliente deben tenerse en cuenta "
        f"al interpretar los resultados."
    )

    destinatarios = []
    if solicitud.analista and solicitud.analista.email:
        destinatarios.append(solicitud.analista.email)
    if solicitud.candidato.email:
        destinatarios.append(solicitud.candidato.email)

    for destinatario in destinatarios:
        context = {
            "subject": asunto,
            "saludo": "Hola,",
            "mensaje": mensaje,
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
            logger.exception("Error enviando notificación de consideración cliente estudio %s", instance.pk)


@receiver(post_save, sender=ClientePoliticaConfiguracion)
def notificar_desbloqueo_politica(sender, instance, created, **kwargs):
    """Notifica al cliente cuando el superadmin desbloquea una política."""
    if created:
        return
    # Solo disparar si la política pasó a desbloqueada
    update_fields = kwargs.get('update_fields')
    if update_fields and 'bloqueado' not in update_fields:
        return
    if instance.bloqueado:
        return

    email_cliente = getattr(instance.empresa, 'email_contacto', None)
    if not email_cliente:
        return

    asunto = "Configuración de políticas desbloqueada"
    mensaje = (
        f"La configuración de la política '{instance.criterio} - {instance.opcion}' "
        f"ha sido desbloqueada por el administrador. "
        f"Ahora puede editar nuevamente su configuración de estudio."
    )
    context = {
        "subject": asunto,
        "saludo": f"Estimado cliente ({instance.empresa.nombre}),",
        "mensaje": mensaje,
    }
    mensaje_html = render_to_string("emails/notificacion_general.html", context)
    mensaje_txt = render_to_string("emails/notificacion_general.txt", context)
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
        logger.exception("Error enviando notificación de desbloqueo empresa %s", instance.empresa.pk)
