from rest_framework.permissions import BasePermission, SAFE_METHODS

class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return getattr(request.user, "rol", None) == "ADMIN"

class IsCliente(BasePermission):
    def has_permission(self, request, view):
        return getattr(request.user, "rol", None) == "CLIENTE"

class IsAnalista(BasePermission):
    def has_permission(self, request, view):
        return getattr(request.user, "rol", None) == "ANALISTA"

class IsCandidato(BasePermission):
    def has_permission(self, request, view):
        return getattr(request.user, "rol", None) == "CANDIDATO"

class ReadOnly(BasePermission):
    def has_permission(self, request, view):
        return request.method in SAFE_METHODS
