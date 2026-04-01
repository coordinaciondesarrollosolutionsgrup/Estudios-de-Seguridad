from django import template
from django.conf import settings

register = template.Library()

@register.simple_tag
def frontend_url():
    return getattr(settings, "FRONTEND_URL", "http://localhost:5173")
