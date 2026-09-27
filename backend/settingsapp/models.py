from django.db import models


class Setting(models.Model):
    """Stored override for a registry key (CLAUDE.md §14). Absent row means the registry default."""

    key = models.CharField(max_length=100, primary_key=True)
    value = models.JSONField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "setting"

    def __str__(self) -> str:
        return self.key
