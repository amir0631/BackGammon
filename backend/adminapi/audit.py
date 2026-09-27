from typing import Any

from rest_framework.request import Request

from accounts.sessions import client_ip
from adminapi.models import AdminAudit, AdminUser


def record(
    request: Request,
    action: str,
    target_type: str,
    target_id: str,
    before: Any,
    after: Any,
    reason: str = "",
) -> AdminAudit:
    assert isinstance(request.user, AdminUser)
    return AdminAudit.objects.create(
        admin=request.user,
        action=action,
        target_type=target_type,
        target_id=target_id,
        before=before,
        after=after,
        reason=reason,
        ip=client_ip(request._request),
    )
