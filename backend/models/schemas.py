from typing import Literal, Optional
from pydantic import BaseModel, Field


class JiraTicket(BaseModel):
    id: str = ""
    title: str = ""
    resolution: str = ""


class Incident(BaseModel):
    incident_id: str
    alert_name: str
    service_affected: str
    severity: Literal["critical", "high", "medium", "low"]
    timestamp: str
    error_log: str
    fix_applied: str
    engineer_name: str
    slack_thread: list[str] = Field(default_factory=list)
    git_commits: list[str] = Field(default_factory=list)
    jira_ticket: JiraTicket = Field(default_factory=JiraTicket)
    outcome: Literal["resolved", "rolled-back", "escalated", "open"] = "open"
    resolution_time_minutes: Optional[int] = None


class RecallRequest(BaseModel):
    alert_text: str


class AlertRequest(BaseModel):
    alert_text: str


class ForgetRequest(BaseModel):
    dataset_name: str


class HealthResponse(BaseModel):
    status: str
