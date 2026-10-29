import * as d3 from "d3";

/**
 * Turns the Cognee graph into what the memory maps draw: the incidents, the
 * pairs of incidents that share an Entity node (an error, a ticket, an
 * engineer...), and the incidents grouped by service, biggest service first.
 */
export function buildModel(data) {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const incidents = data.nodes.filter((n) => n.node_kind === "incident");

  // incident -> the Entity nodes it links to
  const details = new Map(incidents.map((i) => [i.id, new Set()]));
  for (const l of data.links) {
    const s = l.source.id ?? l.source;
    const t = l.target.id ?? l.target;
    if (details.has(s) && byId.get(t)?.type === "Entity") details.get(s).add(t);
    if (details.has(t) && byId.get(s)?.type === "Entity") details.get(t).add(s);
  }

  const links = [];
  for (let a = 0; a < incidents.length; a++)
    for (let b = a + 1; b < incidents.length; b++) {
      const shared = [...details.get(incidents[a].id)].filter((x) => details.get(incidents[b].id).has(x));
      if (shared.length)
        links.push({ a: incidents[a].id, b: incidents[b].id, shared: shared.map((x) => byId.get(x).label) });
    }

  const services = [...d3.group(incidents, (i) => i.service || "unknown")]
    .map(([name, items]) => ({ name, items }))
    .sort((a, b) => b.items.length - a.items.length);
  return { incidents, links, services, details, byId };
}

// Entity -> what kind of thing it is, from its is_a EntityType edge
const KIND_OF = {
  person: "person",
  slackuser: "person",
  engineer: "person",
  jiraticket: "ticket",
  ticket: "ticket",
  alert: "error",
  error: "error",
  errormessage: "error",
  service: "service",
};

// Labels that every incident could share and that say nothing about the problem.
const NOISE = new Set(["resolved", "alertbot", "unresolved", "critical", "high", "medium", "low"]);

/**
 * The concept view: entities shared by two or more incidents, with the
 * incidents that mention them. Single-incident entities are left out, they
 * don't connect anything.
 */
export function buildConcepts(data, model) {
  const { byId, details, incidents } = model;
  const kinds = new Map();
  for (const l of data.links) {
    if (l.relationship !== "is_a") continue;
    const s = byId.get(l.source.id ?? l.source);
    const t = byId.get(l.target.id ?? l.target);
    if (s?.type !== "Entity" || t?.type !== "EntityType") continue;
    const k = KIND_OF[String(t.label).toLowerCase().replace(/[^a-z]/g, "")];
    if (k && !kinds.has(s.id)) kinds.set(s.id, k);
  }
  const mentions = new Map();
  for (const inc of incidents)
    for (const e of details.get(inc.id)) {
      if (!mentions.has(e)) mentions.set(e, []);
      mentions.get(e).push(inc.id);
    }
  // "sarah.chen" from Slack and "sarah-chen" from the ticket are the same person
  const merged = new Map();
  for (const [e, incs] of mentions) {
    const label = String(byId.get(e).label);
    const key = label.toLowerCase().replace(/[\s._]+/g, "-");
    if (NOISE.has(key)) continue;
    const m = merged.get(key) || { id: e, label, kind: kinds.get(e) || "other", incidents: [] };
    if (m.kind === "other" && kinds.get(e)) m.kind = kinds.get(e);
    m.incidents = [...new Set([...m.incidents, ...incs])];
    merged.set(key, m);
  }
  return [...merged.values()].filter((k) => k.incidents.length > 1);
}

// When an incident happened: the incident list's timestamp, or the date in
// its ID (INC-2025-0819 -> Aug 19 2025) when the list hasn't loaded.
export function incidentTime(node, meta) {
  const ts = meta?.get(node.incident_id)?.timestamp;
  if (ts) return new Date(ts);
  const m = /INC-(\d{4})-(\d{2})(\d{2})/.exec(node.incident_id || "");
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] || 1)) : new Date(0);
}

// Who an incident shares details with, for the hover card.
export function sharesOf(id, links, nodeById) {
  return links
    .filter((l) => l.a === id || l.b === id)
    .map((l) => ({ other: nodeById.get(l.a === id ? l.b : l.a), shared: l.shared }));
}
