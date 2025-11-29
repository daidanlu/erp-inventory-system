from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsStaffOrReadOnly(BasePermission):
    """
    Read-only for anonymous and non-staff users.
    Write operations (POST/PUT/PATCH/DELETE) are only allowed for staff users.
    """

    def has_permission(self, request, view):
        # GET / HEAD / OPTIONS allowed
        if request.method in SAFE_METHODS:
            return True
        # others must be is_staff
        user = request.user
        return bool(user and user.is_authenticated and user.is_staff)
