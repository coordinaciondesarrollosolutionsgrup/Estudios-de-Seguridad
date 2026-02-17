from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Notificacion
from .serializers import NotificacionSerializer

class NotificacionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificacionSerializer
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        qs = Notificacion.objects.filter(user=self.request.user).order_by("-created_at")
        unread = self.request.query_params.get("unread")
        if str(unread).lower() in ("1", "true", "yes"):
            qs = qs.filter(is_read=False)
        return qs

    @action(detail=False, methods=["post"])
    def marcar_leidas(self, request):
        Notificacion.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({"ok": True}, status=status.HTTP_200_OK)
