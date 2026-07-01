"""
Phase 2 seed script — ingests all 18 incidents into Cognee via memory_service.
Run from MemOps/: python seed.py
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from backend.services.memory_service import ingest_incident, recall_for_alert
import cognee

# ---------------------------------------------------------------------------
# CLUSTER 1 — Connection pool exhausted on payments-api
# ---------------------------------------------------------------------------

INC_2024_1014 = {
    "incident_id": "INC-2024-1014",
    "alert_name": "connection_pool_exhausted",
    "service_affected": "payments-api",
    "severity": "critical",
    "timestamp": "2024-10-14T03:14:00Z",
    "error_log": "FATAL: remaining connection slots are reserved for non-replication superuser connections",
    "slack_thread": [
        "[03:16] alertbot: 🔴 CRITICAL — payments-api connection pool exhausted",
        "[03:17] sarah.chen: on it, looking at logs now",
        "[03:19] sarah.chen: seeing 'remaining connection slots are reserved' — pool maxed at 10",
        "[03:24] sarah.chen: bumping pool size to 50 and restarting",
        "[03:31] sarah.chen: service back up, monitoring",
        "[03:38] sarah.chen: stable for 7 min, marking resolved",
    ],
    "jira_ticket": {
        "id": "PAY-1847",
        "title": "payments-api: connection pool exhausted under load",
        "resolution": "increased max pool size from 10 to 50",
    },
    "git_commits": [
        "fix(payments-api): increase db pool size 10->50 to handle peak load",
    ],
    "fix_applied": "Increased database connection pool size from 10 to 50, restarted service.",
    "outcome": "resolved",
    "engineer_name": "sarah-chen",
    "resolution_time_minutes": 23,
}

INC_2025_0203 = {
    "incident_id": "INC-2025-0203",
    "alert_name": "connection_pool_exhausted",
    "service_affected": "payments-api",
    "severity": "critical",
    "timestamp": "2025-02-03T02:47:00Z",
    "error_log": "FATAL: remaining connection slots are reserved for non-replication superuser connections",
    "slack_thread": [
        "[02:48] alertbot: 🔴 CRITICAL — payments-api connection pool exhausted",
        "[02:49] raj.patel: this looks like PAY-1847 from October, checking old fix",
        "[02:51] raj.patel: pool is at 50 already, still exhausted — traffic must be higher now",
        "[02:55] raj.patel: bumping to 100 AND adding PgBouncer in front this time so this doesn't keep happening",
        "[02:58] raj.patel: deployed, monitoring",
        "[02:59] raj.patel: resolved, also opened a ticket to make this permanent",
    ],
    "jira_ticket": {
        "id": "PAY-2103",
        "title": "payments-api: connection pool exhausted again, need permanent fix not just bigger number",
        "resolution": "deployed PgBouncer connection pooling middleware, increased pool from 50 to 100",
    },
    "git_commits": [
        "fix(payments-api): add PgBouncer middleware + bump pool 50->100, ref PAY-1847",
    ],
    "fix_applied": "Deployed PgBouncer connection pooling middleware, increased pool size from 50 to 100.",
    "outcome": "resolved",
    "engineer_name": "raj-patel",
    "resolution_time_minutes": 11,
}

INC_2025_0819 = {
    "incident_id": "INC-2025-0819",
    "alert_name": "connection_pool_utilization_high",
    "service_affected": "payments-api",
    "severity": "medium",
    "timestamp": "2025-08-19T14:22:00Z",
    "error_log": "WARNING: connection pool utilization at 85%, approaching PgBouncer ceiling",
    "slack_thread": [
        "[14:23] alertbot: 🟡 WARNING — payments-api pool utilization high",
        "[14:24] sarah.chen: this is the third time we've hit pool limits this year, PAY-1847 and PAY-2103 ring a bell",
        "[14:26] sarah.chen: instead of bumping the number again, let's add autoscaling for pool size based on traffic",
        "[14:40] sarah.chen: deployed dynamic pool scaling (min 50, max 200, scales on connection wait time)",
        "[14:45] sarah.chen: no manual restart needed this time, system self-corrected",
        "[14:50] sarah.chen: marking resolved, this should be the last manual intervention needed for this pattern",
    ],
    "jira_ticket": {
        "id": "PAY-2890",
        "title": "payments-api: implement dynamic connection pool scaling to stop recurring incidents",
        "resolution": "deployed autoscaling pool sizer, min 50 max 200, scales on wait-time metric",
    },
    "git_commits": [
        "feat(payments-api): dynamic pool autoscaling to eliminate recurring PAY-1847/PAY-2103 pattern",
    ],
    "fix_applied": "Implemented dynamic autoscaling for connection pool (min 50, max 200), no manual restart required, system self-corrected.",
    "outcome": "resolved",
    "engineer_name": "sarah-chen",
    "resolution_time_minutes": 27,
}

# ---------------------------------------------------------------------------
# CLUSTER 2 — Memory leak on recommendation-service
# ---------------------------------------------------------------------------

INC_2024_0612 = {
    "incident_id": "INC-2024-0612",
    "alert_name": "oom_killed",
    "service_affected": "recommendation-service",
    "severity": "critical",
    "timestamp": "2024-06-12T09:03:00Z",
    "error_log": "OOMKilled: container exceeded memory limit 4096Mi",
    "slack_thread": [
        "[09:04] alertbot: 🔴 CRITICAL — recommendation-service OOM killed, pod restarting in crashloop",
        "[09:06] mike.torres: third restart in 10 min, this isn't a normal spike",
        "[09:15] mike.torres: memory climbs steadily over ~6hrs then crashes, looks like a leak",
        "[09:40] mike.torres: don't have time to find root cause right now, bumping memory limit 4096->8192 as a stopgap",
        "[09:45] mike.torres: restarted with higher limit, stable for now but this will probably come back",
    ],
    "jira_ticket": {
        "id": "REC-512",
        "title": "recommendation-service: OOM crash, suspected memory leak, root cause unknown",
        "resolution": "temporary — increased memory limit 4Gi to 8Gi, root cause not yet found",
    },
    "git_commits": [
        "chore(recommendation-service): bump memory limit 4Gi->8Gi as stopgap for OOM crashes",
    ],
    "fix_applied": "Increased memory limit as a temporary stopgap from 4Gi to 8Gi. Root cause not identified yet — suspected memory leak.",
    "outcome": "resolved",
    "engineer_name": "mike-torres",
    "resolution_time_minutes": 182,
}

INC_2024_1130 = {
    "incident_id": "INC-2024-1130",
    "alert_name": "oom_killed",
    "service_affected": "recommendation-service",
    "severity": "high",
    "timestamp": "2024-11-30T16:18:00Z",
    "error_log": "OOMKilled: container exceeded memory limit 8192Mi",
    "slack_thread": [
        "[16:19] alertbot: 🟠 HIGH — recommendation-service OOM killed",
        "[16:20] priya.nair: same pattern as REC-512 in June, the stopgap limit increase wore off",
        "[16:22] priya.nair: pulling a heap dump before restart this time to actually find the leak",
        "[16:50] priya.nair: found it — the ML model cache is never being evicted, just grows forever per request",
        "[17:10] priya.nair: added manual cache.clear() call on a 1hr interval as a patch",
        "[17:15] priya.nair: deployed, will monitor over next few days to confirm it holds",
    ],
    "jira_ticket": {
        "id": "REC-688",
        "title": "recommendation-service: found root cause of REC-512 — ML model cache never evicted",
        "resolution": "added manual periodic cache clearing on 1hr interval, addresses symptom not root cause",
    },
    "git_commits": [
        "fix(recommendation-service): periodic manual cache eviction, addresses REC-512 root cause",
    ],
    "fix_applied": "Identified ML model cache as the leak source — cache grows unbounded per request. Added manual periodic cache clearing on 1hr interval. Partial fix — addresses symptom, not architectural root cause.",
    "outcome": "resolved",
    "engineer_name": "priya-nair",
    "resolution_time_minutes": 92,
}

INC_2025_0407 = {
    "incident_id": "INC-2025-0407",
    "alert_name": "cache_eviction_missed",
    "service_affected": "recommendation-service",
    "severity": "low",
    "timestamp": "2025-04-07T11:05:00Z",
    "error_log": "WARNING: cache size approaching configured max, eviction job did not run on schedule",
    "slack_thread": [
        "[11:06] alertbot: 🟢 LOW — recommendation-service cache eviction missed scheduled run",
        "[11:08] mike.torres: this traces back to REC-512 and REC-688, the manual interval clearing is fragile",
        "[11:09] mike.torres: replacing the manual interval hack with a proper scheduled eviction job + alerting if it fails to run",
        "[11:25] mike.torres: deployed scheduled job via cron, added monitoring so we get paged if eviction ever silently fails again",
        "[11:28] mike.torres: this should be the permanent fix for the whole REC-512/REC-688 pattern",
    ],
    "jira_ticket": {
        "id": "REC-1024",
        "title": "recommendation-service: replace fragile manual cache clearing with proper scheduled job + monitoring, closes REC-512 and REC-688",
        "resolution": "scheduled cron eviction job with failure alerting, permanent fix",
    },
    "git_commits": [
        "feat(recommendation-service): scheduled cache eviction job + alerting, permanent fix for REC-512/REC-688 pattern",
    ],
    "fix_applied": "Replaced manual interval clearing hack with a monitored scheduled eviction job via cron. Permanent fix for the REC-512/REC-688 memory leak pattern.",
    "outcome": "resolved",
    "engineer_name": "mike-torres",
    "resolution_time_minutes": 23,
}

# ---------------------------------------------------------------------------
# CLUSTER 3 — SSL certificate expiry on api-gateway
# ---------------------------------------------------------------------------

INC_2024_0301 = {
    "incident_id": "INC-2024-0301",
    "alert_name": "ssl_certificate_expired",
    "service_affected": "api-gateway",
    "severity": "critical",
    "timestamp": "2024-03-01T00:02:00Z",
    "error_log": "SSL handshake failed: certificate has expired (notAfter: 2024-02-29 23:59:59 UTC)",
    "slack_thread": [
        "[00:03] alertbot: 🔴 CRITICAL — api-gateway SSL cert expired, all external traffic failing",
        "[00:04] devops.alex: scrambling, didn't realize this was expiring tonight",
        "[00:18] devops.alex: renewed manually via the provider dashboard, deploying now",
        "[00:24] devops.alex: traffic restored",
        "[00:25] devops.alex: we need to automate this, noted for follow up",
    ],
    "jira_ticket": {
        "id": "GATE-301",
        "title": "api-gateway: SSL cert expired causing full outage, renewal was manual and missed",
        "resolution": "manually renewed certificate, follow-up ticket created for automation",
    },
    "git_commits": [
        "fix(api-gateway): manually renew expired SSL cert",
    ],
    "fix_applied": "Manually renewed expired SSL certificate via provider dashboard. Traffic restored. Follow-up ticket created for automating cert renewal.",
    "outcome": "resolved",
    "engineer_name": "devops-alex",
    "resolution_time_minutes": 22,
}

INC_2024_0905 = {
    "incident_id": "INC-2024-0905",
    "alert_name": "ssl_certificate_expired",
    "service_affected": "api-gateway",
    "severity": "critical",
    "timestamp": "2024-09-05T00:01:00Z",
    "error_log": "SSL handshake failed: certificate has expired (notAfter: 2024-09-04 23:59:59 UTC)",
    "slack_thread": [
        "[00:02] alertbot: 🔴 CRITICAL — api-gateway SSL cert expired, all external traffic failing",
        "[00:03] sarah.chen: this is the exact same thing as GATE-301 in March, the automation ticket was never picked up",
        "[00:16] sarah.chen: renewed manually again, traffic restored",
        "[00:20] sarah.chen: escalating the automation ticket, this cannot keep happening manually",
    ],
    "jira_ticket": {
        "id": "GATE-655",
        "title": "api-gateway: SSL cert expired AGAIN, same as GATE-301, automation still not done, escalating priority",
        "resolution": "manually renewed certificate again, automation ticket escalated to high priority",
    },
    "git_commits": [
        "fix(api-gateway): manually renew expired SSL cert (recurrence of GATE-301)",
    ],
    "fix_applied": "Manually renewed expired SSL certificate again (second recurrence). Automation ticket escalated to high priority.",
    "outcome": "resolved",
    "engineer_name": "sarah-chen",
    "resolution_time_minutes": 19,
}

INC_2025_0301 = {
    "incident_id": "INC-2025-0301",
    "alert_name": "ssl_cert_auto_renewal_triggered",
    "service_affected": "api-gateway",
    "severity": "low",
    "timestamp": "2025-03-01T09:00:00Z",
    "error_log": "INFO: SSL certificate renewal automation triggered, 30 days before expiry threshold met",
    "slack_thread": [
        "[09:00] alertbot: 🟢 INFO — api-gateway SSL cert auto-renewal triggered successfully",
        "[09:01] devops.alex: this is the cert-manager automation finally going live, closes out GATE-301 and GATE-655",
        "[09:02] devops.alex: renewed automatically, zero downtime, no manual intervention needed",
        "[09:03] devops.alex: this pattern should never recur again now that it's automated",
    ],
    "jira_ticket": {
        "id": "GATE-1102",
        "title": "api-gateway: cert-manager automation deployed, closes GATE-301 and GATE-655 permanently",
        "resolution": "deployed cert-manager for automatic SSL renewal 30 days before expiry",
    },
    "git_commits": [
        "feat(api-gateway): deploy cert-manager for automated SSL renewal, closes GATE-301/GATE-655",
    ],
    "fix_applied": "Deployed cert-manager for automated SSL certificate renewal triggered 30 days before expiry. Zero downtime, no manual intervention. Closes GATE-301 and GATE-655 permanently.",
    "outcome": "resolved",
    "engineer_name": "devops-alex",
    "resolution_time_minutes": 3,
}

# ---------------------------------------------------------------------------
# STANDALONE INCIDENTS
# ---------------------------------------------------------------------------

INC_2024_0418 = {
    "incident_id": "INC-2024-0418",
    "alert_name": "sms_delivery_failing",
    "service_affected": "notification-service",
    "severity": "medium",
    "timestamp": "2024-04-18T13:40:00Z",
    "error_log": "ERROR: third-party SMS provider (Twilio) returned 503 for 14 consecutive requests",
    "slack_thread": [
        "[13:41] alertbot: 🟡 WARNING — notification-service SMS delivery failing",
        "[13:45] priya.nair: Twilio status page confirms an outage on their end, nothing we can fix",
        "[13:50] priya.nair: queued failed messages for retry once they recover",
        "[14:30] priya.nair: Twilio back up, retry queue cleared, all messages delivered",
    ],
    "jira_ticket": {
        "id": "NOTIF-204",
        "title": "notification-service: SMS delivery failures due to Twilio outage",
        "resolution": "no action needed, third-party outage, messages queued and retried successfully",
    },
    "git_commits": [],
    "fix_applied": "No code change needed. Third-party Twilio outage. Failed messages queued and retried successfully once provider recovered.",
    "outcome": "resolved",
    "engineer_name": "priya-nair",
    "resolution_time_minutes": 50,
}

INC_2024_0522 = {
    "incident_id": "INC-2024-0522",
    "alert_name": "disk_space_critical",
    "service_affected": "analytics-pipeline",
    "severity": "high",
    "timestamp": "2024-05-22T06:15:00Z",
    "error_log": "ERROR: disk usage at 97% on analytics-pipeline-worker-3, write operations failing",
    "slack_thread": [
        "[06:16] alertbot: 🟠 HIGH — analytics-pipeline disk space critical",
        "[06:18] raj.patel: old log files never got cleaned up, eating 40GB",
        "[06:25] raj.patel: cleared old logs, freed space, also adding log rotation",
        "[06:35] raj.patel: deployed logrotate config, should not recur",
    ],
    "jira_ticket": {
        "id": "ANLY-77",
        "title": "analytics-pipeline: disk full from uncleaned logs",
        "resolution": "cleared old logs, added logrotate configuration",
    },
    "git_commits": [
        "fix(analytics-pipeline): add logrotate config to prevent disk space exhaustion",
    ],
    "fix_applied": "Cleared 40GB of old log files. Deployed logrotate configuration to prevent recurrence.",
    "outcome": "resolved",
    "engineer_name": "raj-patel",
    "resolution_time_minutes": 20,
}

INC_2024_0707 = {
    "incident_id": "INC-2024-0707",
    "alert_name": "deploy_failed_health_check",
    "service_affected": "auth-service",
    "severity": "critical",
    "timestamp": "2024-07-07T19:22:00Z",
    "error_log": "DEPLOY FAILURE: auth-service v2.4.1 rollout failed health checks, auto-rollback triggered",
    "slack_thread": [
        "[19:23] alertbot: 🔴 CRITICAL — auth-service deploy v2.4.1 failed health checks",
        "[19:24] mike.torres: rollback already triggered automatically, checking what broke",
        "[19:30] mike.torres: new JWT validation logic had a null pointer on edge case, bug in the deploy not infra",
        "[19:45] mike.torres: fixed the null check, redeploying",
        "[19:52] mike.torres: v2.4.2 deployed successfully, health checks passing",
    ],
    "jira_ticket": {
        "id": "AUTH-340",
        "title": "auth-service: v2.4.1 deploy failed due to null pointer in JWT validation",
        "resolution": "fixed null check bug, redeployed as v2.4.2",
    },
    "git_commits": [
        "fix(auth-service): null check in JWT validation edge case, fixes failed v2.4.1 deploy",
    ],
    "fix_applied": "Fixed null pointer in JWT validation edge case. Auto-rollback had reverted to previous version. Redeployed as v2.4.2 successfully.",
    "outcome": "resolved",
    "engineer_name": "mike-torres",
    "resolution_time_minutes": 30,
}

INC_2024_0814 = {
    "incident_id": "INC-2024-0814",
    "alert_name": "elasticsearch_cluster_degraded",
    "service_affected": "search-service",
    "severity": "medium",
    "timestamp": "2024-08-14T10:50:00Z",
    "error_log": "ERROR: Elasticsearch cluster yellow status, 1 unassigned shard",
    "slack_thread": [
        "[10:51] alertbot: 🟡 WARNING — search-service Elasticsearch cluster degraded",
        "[10:55] sarah.chen: one node had a brief network blip, shard reallocation stuck",
        "[11:05] sarah.chen: manually triggered shard reallocation",
        "[11:12] sarah.chen: cluster back to green status",
    ],
    "jira_ticket": {
        "id": "SRCH-89",
        "title": "search-service: Elasticsearch cluster yellow status from stuck shard",
        "resolution": "manually triggered shard reallocation after network blip",
    },
    "git_commits": [],
    "fix_applied": "Manually triggered Elasticsearch shard reallocation after brief network blip caused shard to get stuck. No code change needed.",
    "outcome": "resolved",
    "engineer_name": "sarah-chen",
    "resolution_time_minutes": 21,
}

INC_2024_1003 = {
    "incident_id": "INC-2024-1003",
    "alert_name": "stripe_webhook_verification_failing",
    "service_affected": "billing-service",
    "severity": "high",
    "timestamp": "2024-10-03T15:30:00Z",
    "error_log": "ERROR: webhook signature verification failing for 100% of Stripe webhook events",
    "slack_thread": [
        "[15:31] alertbot: 🟠 HIGH — billing-service Stripe webhook verification failing",
        "[15:33] raj.patel: Stripe rotated their webhook signing secret, we have the old one configured",
        "[15:40] raj.patel: updated signing secret in vault, redeployed",
        "[15:45] raj.patel: webhooks verifying successfully now, backfilling missed events from Stripe dashboard",
    ],
    "jira_ticket": {
        "id": "BILL-156",
        "title": "billing-service: Stripe webhook signature mismatch after secret rotation",
        "resolution": "updated webhook signing secret, backfilled missed events",
    },
    "git_commits": [
        "fix(billing-service): update Stripe webhook signing secret",
    ],
    "fix_applied": "Updated Stripe webhook signing secret in vault to match provider's rotated value. Redeployed and backfilled missed events.",
    "outcome": "resolved",
    "engineer_name": "raj-patel",
    "resolution_time_minutes": 14,
}

INC_2024_1211 = {
    "incident_id": "INC-2024-1211",
    "alert_name": "latency_degraded",
    "service_affected": "user-profile-service",
    "severity": "low",
    "timestamp": "2024-12-11T11:00:00Z",
    "error_log": "WARNING: API response time p99 degraded from 200ms to 1.8s over past hour",
    "slack_thread": [
        "[11:01] alertbot: 🟢 LOW — user-profile-service latency degraded",
        "[11:10] priya.nair: a new database index was added for a different team's query and it's blocking writes during build",
        "[11:20] priya.nair: index build finished, latency back to normal",
        "[11:21] priya.nair: flagging to the other team to schedule index builds during low traffic windows next time",
    ],
    "jira_ticket": {
        "id": "PROF-45",
        "title": "user-profile-service: latency spike from concurrent index build",
        "resolution": "index build completed naturally, no intervention needed, process note added for future index builds",
    },
    "git_commits": [],
    "fix_applied": "No fix needed. Latency spike caused by concurrent database index build from another team. Index completed naturally. Process note added to schedule index builds during low-traffic windows.",
    "outcome": "resolved",
    "engineer_name": "priya-nair",
    "resolution_time_minutes": 21,
}

INC_2025_0118 = {
    "incident_id": "INC-2025-0118",
    "alert_name": "stale_currency_rates",
    "service_affected": "payments-api",
    "severity": "medium",
    "timestamp": "2025-01-18T08:40:00Z",
    "error_log": "ERROR: currency conversion rate API returned stale data, timestamps 6 hours old",
    "slack_thread": [
        "[08:41] alertbot: 🟡 WARNING — payments-api using stale currency rates",
        "[08:45] mike.torres: rate provider's cache wasn't invalidating, unrelated to our pool issues from PAY-1847/2103",
        "[08:55] mike.torres: forced cache invalidation, rates refreshing correctly",
        "[09:00] mike.torres: added a freshness check that alerts if rates are older than 1hr going forward",
    ],
    "jira_ticket": {
        "id": "PAY-2050",
        "title": "payments-api: stale currency conversion rates from provider cache issue",
        "resolution": "forced cache invalidation, added freshness monitoring",
    },
    "git_commits": [
        "fix(payments-api): add currency rate freshness check, unrelated to pool sizing issues",
    ],
    "fix_applied": "Forced cache invalidation on the currency rate provider. Added freshness monitoring to alert if rates are older than 1 hour. Unrelated to the connection pool issues (PAY-1847, PAY-2103).",
    "outcome": "resolved",
    "engineer_name": "mike-torres",
    "resolution_time_minutes": 19,
}

INC_2025_0625 = {
    "incident_id": "INC-2025-0625",
    "alert_name": "registry_push_timeout",
    "service_affected": "deployment-pipeline",
    "severity": "high",
    "timestamp": "2025-06-25T17:05:00Z",
    "error_log": "ERROR: CI/CD pipeline stuck for 45 minutes, Docker registry push timing out",
    "slack_thread": [
        "[17:06] alertbot: 🟠 HIGH — deployment-pipeline stuck, registry push timeout",
        "[17:10] devops.alex: registry provider having intermittent issues, confirmed via their status page",
        "[17:25] devops.alex: switched to backup registry mirror temporarily",
        "[17:35] devops.alex: pipeline unstuck, deploy completed",
        "[17:36] devops.alex: switching back to primary registry once their status page clears",
    ],
    "jira_ticket": {
        "id": "PIPE-92",
        "title": "deployment-pipeline: stuck on registry push timeout, third-party registry issue",
        "resolution": "switched to backup registry mirror temporarily",
    },
    "git_commits": [],
    "fix_applied": "Switched to backup Docker registry mirror temporarily while primary provider had intermittent issues. No code change needed.",
    "outcome": "resolved",
    "engineer_name": "devops-alex",
    "resolution_time_minutes": 30,
}

# ---------------------------------------------------------------------------
# All 18 incidents in ingest order
# ---------------------------------------------------------------------------

ALL_INCIDENTS = [
    # Cluster 1 — payments-api connection pool
    INC_2024_1014,
    INC_2025_0203,
    INC_2025_0819,
    # Cluster 2 — recommendation-service memory leak
    INC_2024_0612,
    INC_2024_1130,
    INC_2025_0407,
    # Cluster 3 — api-gateway SSL expiry
    INC_2024_0301,
    INC_2024_0905,
    INC_2025_0301,
    # Standalones
    INC_2024_0418,
    INC_2024_0522,
    INC_2024_0707,
    INC_2024_0814,
    INC_2024_1003,
    INC_2024_1211,
    INC_2025_0118,
    INC_2025_0625,
]

VERIFICATIONS = [
    "payments-api connection issues",
    "recommendation-service high memory usage",
    "api-gateway certificate problem",
]


async def run():
    print("\n" + "="*60)
    print("PHASE 2 — SEEDING 18 INCIDENTS")
    print("="*60)

    print("\n[0] Wiping all existing data for a clean seed...")
    await cognee.forget(everything=True)
    print("    Wiped.\n")

    for i, incident in enumerate(ALL_INCIDENTS, 1):
        iid = incident["incident_id"]
        svc = incident["service_affected"]
        print(f"[{i:02d}/18] Ingesting {iid} ({svc})...", end=" ", flush=True)
        await ingest_incident(incident)
        print("done.")

    print(f"\n✓ All {len(ALL_INCIDENTS)} incidents ingested.\n")

    print("="*60)
    print("VERIFICATION RECALLS")
    print("="*60)

    for idx, query in enumerate(VERIFICATIONS, 1):
        print(f"\n{'='*60}")
        print(f"RECALL {idx}: {query!r}")
        print("="*60)

        result = await recall_for_alert(query)
        print(f"\nQuery : {result['query']}")
        print(f"Count : {result['count']} result(s)\n")

        for j, r in enumerate(result["results"]):
            print(f"--- Result {j+1} ---")
            print(f"  type        : {r['type']}")
            print(f"  source      : {r['source']}")
            print(f"  search_type : {r['search_type']}")
            print(f"  dataset     : {r['dataset_name']}")
            print(f"  text        : {r['text']}")
            print(f"  raw         : {r['raw']}")
            print()

    print("="*60)
    print("END OF VERIFICATION RECALLS")
    print("="*60)


if __name__ == "__main__":
    asyncio.run(run())
