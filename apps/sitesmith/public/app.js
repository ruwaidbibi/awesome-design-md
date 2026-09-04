const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const kid of kids.flat()) {
    if (kid != null) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
};

const state = { meta: null, leads: [], selectedId: null, detail: null, activeSiteId: null, stream: null };

const STATUS_LABEL = {
  none: "no website",
  social_only: "social only",
  directory_only: "listing only",
  dead: "dead domain",
  parked: "parked domain",
  unreachable: "unverified",
  live: "has a website",
  unchecked: "unchecked",
};

const kb = (bytes) => {
  const n = bytes / 1024;
  return n < 10 ? `${n.toFixed(1)} kB` : `${n.toFixed(0)} kB`;
};

const badge = (status) =>
  el("span", { className: `badge ${status}` }, STATUS_LABEL[status] ?? status);

function log(target, message, cls) {
  const node = $(target);
  if (!node) return;
  node.append(el("div", { className: cls ?? "" }, message), "\n");
  node.scrollTop = node.scrollHeight;
}

const clearLog = (target) => { const n = $(target); if (n) n.textContent = ""; };

async function api(path, options) {
  const res = await fetch(path, {
    headers: options?.body ? { "content-type": "application/json" } : undefined,
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  return body;
}

/* ---------------------------------- boot --------------------------------- */

async function boot() {
  state.meta = await api("/api/meta");
  const m = state.meta;

  $("#meta").replaceChildren(
    el("span", { className: `chip ${m.placesKeyPresent ? "ok" : "off"}` },
      m.placesKeyPresent ? `places: ${m.provider}` : "places: fixtures (no key)"),
    el("span", { className: `chip ${m.generationReady ? "ok" : "off"}` },
      m.generationReady ? `model: ${m.model} · ${m.effort}` : "generation: no API key"),
    el("span", { className: `chip ${m.socialSearchProvider ? "ok" : "off"}` },
      m.socialSearchProvider ? `socials: ${m.socialSearchProvider}` : "socials: places only"),
    el("span", { className: "chip" }, `${m.designs.length} designs`),
  );

  const hints = [];
  if (!m.placesKeyPresent) {
    hints.push("No GOOGLE_MAPS_API_KEY, so searches return sample businesses. Everything downstream is real.");
  } else {
    hints.push(`Live Google Places search, up to ${m.maxPages * 20} results per query. Each page is a billed request.`);
  }
  $("#searchHint").textContent = hints.join(" ");

  $("#search").addEventListener("click", runSearch);
  $("#loadAll").addEventListener("click", loadSaved);
  for (const id of ["#q", "#loc", "#minReviews"]) {
    $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });
  }

  await loadSaved({ quiet: true });
}

/* -------------------------------- searching ------------------------------ */

function runSearch() {
  const query = $("#q").value.trim();
  if (!query) return;

  state.stream?.close();
  clearLog("#searchLog");
  $("#search").disabled = true;
  $("#search").textContent = "Searching...";

  const params = new URLSearchParams({
    query,
    location: $("#loc").value.trim(),
    minReviews: $("#minReviews").value || "0",
    includeLiveSites: String($("#includeLive").checked),
  });

  const source = new EventSource(`/api/prospect/stream?${params}`);
  state.stream = source;

  source.addEventListener("progress", (e) => {
    const d = JSON.parse(e.data);
    if (d.phase === "searching") log("#searchLog", `searching ${d.provider}: "${d.query}"${d.location ? ` in ${d.location}` : ""}`);
    if (d.phase === "searched") log("#searchLog", `found ${d.found} places across ${d.pages} page(s), ${d.billedRequests} billed request(s)`);
    if (d.phase === "filtered") log("#searchLog", `${d.kept} at or above ${d.minReviews} reviews, ${d.dropped} below`);
    if (d.phase === "validated") {
      log("#searchLog", d.error
        ? `  [${d.done}/${d.total}] ${d.name}: ${d.error}`
        : `  [${d.done}/${d.total}] ${d.name}: ${STATUS_LABEL[d.websiteStatus] ?? d.websiteStatus}`,
        d.error ? "err" : "");
    }
  });

  source.addEventListener("result", (e) => {
    const d = JSON.parse(e.data);
    log("#searchLog", `${d.leads.length} lead(s) worth approaching out of ${d.scanned} scanned`);
    renderLeads(d.leads);
    finishSearch(source);
  });

  source.addEventListener("error", (e) => {
    const message = e.data ? JSON.parse(e.data).message : "Connection to the server was lost";
    log("#searchLog", `error: ${message}`, "err");
    finishSearch(source);
  });
}

function finishSearch(source) {
  source.close();
  if (state.stream === source) state.stream = null;
  $("#search").disabled = false;
  $("#search").textContent = "Find leads";
}

async function loadSaved({ quiet = false } = {}) {
  const { businesses } = await api("/api/businesses");
  if (!quiet && businesses.length === 0) log("#searchLog", "nothing saved yet");
  renderLeads(businesses);
}

function renderLeads(leads) {
  state.leads = leads;
  $("#leadCount").textContent = leads.length ? `(${leads.length})` : "";

  if (leads.length === 0) {
    $("#leads").replaceChildren(el("p", { className: "empty" }, "No leads yet."));
    return;
  }

  const rows = leads.map((b) => {
    const socials = b.socials?.socials ?? [];
    const tr = el("tr", { className: "lead", tabIndex: 0 },
      el("td", { className: "num score" }, b.score.toFixed(0)),
      el("td", {},
        el("div", { className: "name" }, b.name),
        el("div", { className: "sub" }, [b.primary_type?.replace(/_/g, " "), b.address?.split(",")[1]?.trim()].filter(Boolean).join(" · ")),
      ),
      el("td", { className: "num" }, String(b.review_count),
        el("div", { className: "sub" }, b.rating ? `${b.rating.toFixed(1)}★` : "—")),
      el("td", {}, badge(b.website_status),
        socials.length ? el("div", { className: "sub" }, `${socials.length} social`) : null),
      el("td", {}, b.status === "new" ? "" : el("span", { className: "chip" }, b.status)),
    );
    tr.setAttribute("aria-selected", String(b.id === state.selectedId));
    const open = () => selectLead(b.id);
    tr.addEventListener("click", open);
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    return tr;
  });

  $("#leads").replaceChildren(
    el("table", { className: "leads" },
      el("thead", {}, el("tr", {},
        el("th", {}, "Score"), el("th", {}, "Business"), el("th", {}, "Reviews"),
        el("th", {}, "Website"), el("th", {}, ""))),
      el("tbody", {}, ...rows),
    ),
  );
}

/* --------------------------------- detail -------------------------------- */

async function selectLead(id) {
  state.selectedId = id;
  state.detail = await api(`/api/businesses/${encodeURIComponent(id)}`);
  state.activeSiteId = state.detail.sites.find((s) => s.status !== "failed")?.id ?? null;
  for (const tr of document.querySelectorAll("tr.lead")) tr.setAttribute("aria-selected", "false");
  renderLeads(state.leads);
  renderDetail();
  $("#detailCol").scrollTop = 0;
}

function renderDetail() {
  const { business, sites } = state.detail;
  const node = $("#detailTpl").content.cloneNode(true);

  /* facts */
  const socials = business.socials?.socials ?? [];
  const notes = business.socials?.notes ?? [];
  const facts = el("div", {},
    el("dl", { className: "facts" },
      el("dt", {}, "Name"), el("dd", {}, business.name),
      el("dt", {}, "Category"), el("dd", {}, business.primary_type?.replace(/_/g, " ") ?? "—"),
      el("dt", {}, "Address"), el("dd", {}, business.address ?? "—"),
      el("dt", {}, "Phone"), el("dd", {}, business.phone ?? "—"),
      el("dt", {}, "Google"), el("dd", {},
        `${business.rating ?? "—"}★ from ${business.review_count} reviews · `,
        business.google_maps_uri ? el("a", { href: business.google_maps_uri, target: "_blank", rel: "noreferrer noopener" }, "open in Maps") : "—"),
      el("dt", {}, "Website field"), el("dd", {},
        business.website_uri
          ? el("a", { href: business.website_uri, target: "_blank", rel: "noreferrer noopener" }, business.website_uri)
          : el("em", {}, "empty")),
      el("dt", {}, "Verdict"), el("dd", {}, badge(business.website_status)),
    ),
    el("p", { className: "evidence" },
      business.website_reason ?? "Not validated yet.",
      business.website_http_status ? ` (HTTP ${business.website_http_status})` : "",
      business.website_checked_at ? el("div", { className: "sub", style: "color:var(--dim);font-size:11.5px" }, `checked ${new Date(business.website_checked_at).toLocaleString()}`) : null,
    ),
    el("h3", { style: "font-size:12px;color:var(--muted);margin:14px 0 0;text-transform:uppercase;letter-spacing:.06em" }, "Social presence"),
    socials.length
      ? el("ul", { className: "plain" }, ...socials.map((s) =>
          el("li", {},
            el("strong", {}, s.platform),
            el("a", { href: s.url, target: "_blank", rel: "noreferrer noopener" }, s.url.replace(/^https?:\/\/(www\.)?/, "")),
            el("span", { className: "conf" }, `${s.source} · ${s.confidence}`))))
      : el("p", { className: "hint" }, "None found."),
    ...notes.map((n) => el("p", { className: "hint" }, n)),
    el("div", { className: "row", style: "margin-top:14px" },
      el("button", { className: "tiny", onclick: revalidate }, "Re-check website"),
      el("button", { className: "tiny", onclick: () => setStatus("shortlisted") }, "Shortlist"),
      el("button", { className: "tiny", onclick: () => setStatus("rejected") }, "Reject"),
    ),
  );
  node.querySelector('[data-slot="facts"]').replaceChildren(facts);

  /* score */
  const breakdown = business.score_breakdown ?? [];
  const max = Math.max(25, ...breakdown.map((t) => Math.abs(t.points)));
  node.querySelector('[data-slot="score"]').replaceChildren(
    el("div", { className: "bars" }, ...breakdown.map((t) =>
      el("div", { className: "bar" },
        el("span", { className: "lbl", title: t.detail }, t.label),
        el("span", { className: "track" },
          el("span", { className: `fill${t.points < 0 ? " neg" : ""}`, style: `width:${Math.min(100, (Math.abs(t.points) / max) * 100)}%` })),
        el("span", { className: "val" }, t.points.toFixed(1)))),
      el("div", { className: "bar", style: "margin-top:4px;border-top:1px solid var(--line-soft);padding-top:6px" },
        el("span", { className: "lbl" }, el("strong", {}, "Total")),
        el("span", {}, ""),
        el("span", { className: "val" }, el("strong", {}, business.score.toFixed(1)))),
    ),
  );

  /* generation */
  const select = node.querySelector("#design");
  select.replaceChildren(...state.meta.designs.map((d) => el("option", { value: d.key }, d.label)));
  select.value = localStorage.getItem("sitesmith:design") ?? state.meta.designs[0]?.key ?? "";
  const descNode = node.querySelector('[data-slot="designDesc"]');
  const showDesc = () => {
    const d = state.meta.designs.find((x) => x.key === select.value);
    descNode.textContent = d?.description ?? "";
  };
  select.addEventListener("change", () => { localStorage.setItem("sitesmith:design", select.value); showDesc(); });
  showDesc();

  const genButton = node.querySelector("#generate");
  if (!state.meta.generationReady) {
    genButton.disabled = true;
    node.querySelector('[data-slot="genHint"]').textContent =
      "Set ANTHROPIC_API_KEY in apps/sitesmith/.env and restart to enable generation.";
  } else {
    node.querySelector('[data-slot="genHint"]').textContent =
      "One click. Streams for a minute or two, then lands in the preview below.";
  }
  genButton.addEventListener("click", () => generate({ design: select.value }));

  /* versions + preview */
  if (sites.length > 0) {
    node.querySelector('[data-slot="versionsCard"]').hidden = false;
    node.querySelector('[data-slot="versions"]').replaceChildren(...sites.map(renderVersion));
    node.querySelector('[data-slot="preview"]').replaceChildren(renderPreview());
  }

  $("#detailCol").replaceChildren(node);
}

function renderVersion(site) {
  const row = el("div", { className: "version" },
    el("strong", {}, `v${site.version}`),
    el("span", { className: "grow sub" },
      [site.design_key,
       site.status,
       site.bytes ? kb(site.bytes) : null,
       site.output_tokens ? `${site.output_tokens} out tok` : null,
       site.feedback ? "revision" : null,
      ].filter(Boolean).join(" · ")),
    site.published_url
      ? el("a", { href: site.published_url, target: "_blank", rel: "noreferrer noopener" }, "live")
      : null,
    site.status === "failed" ? null : el("button", { className: "tiny", onclick: () => { state.activeSiteId = site.id; renderDetail(); } }, "View"),
  );
  row.setAttribute("aria-selected", String(site.id === state.activeSiteId));
  if (site.error) row.append(el("div", { className: "sub", style: "flex-basis:100%;color:var(--bad)" }, site.error));
  return row;
}

function renderPreview() {
  const site = state.detail.sites.find((s) => s.id === state.activeSiteId);
  if (!site?.html_path) return el("p", { className: "hint" }, "No generated file to preview.");

  const frame = el("iframe", {
    className: "preview",
    src: `/preview/${site.id}`,
    title: `Preview of ${state.detail.business.name} website`,
  });
  frame.dataset.vp = "desktop";

  const vpButton = (id, label) =>
    el("button", { className: "tiny", onclick: () => { frame.dataset.vp = id; } }, label);

  const feedback = el("textarea", {
    placeholder: "What should change? e.g. warmer hero, put the phone number in the header, drop the FAQ",
  });

  return el("div", {},
    el("div", { className: "preview-bar" },
      vpButton("desktop", "Desktop"), vpButton("tablet", "Tablet"), vpButton("phone", "Phone"),
      el("span", { className: "spacer" }),
      el("a", { href: `/preview/${site.id}`, target: "_blank", rel: "noreferrer noopener" }, "open"),
      el("a", { href: `/api/sites/${site.id}/source`, target: "_blank", rel: "noreferrer noopener" }, "source"),
    ),
    el("div", { className: "frame-wrap" }, frame),
    el("div", { style: "margin-top:14px" },
      el("div", { className: "field" },
        el("label", { htmlFor: "fb" }, "Not right yet? Say what to change and regenerate."),
        feedback),
      el("div", { className: "row" },
        el("button", {
          disabled: !state.meta.generationReady,
          onclick: () => {
            const text = feedback.value.trim();
            if (!text) { feedback.focus(); return; }
            generate({ design: site.design_key, feedback: text, previousSiteId: site.id });
          },
        }, "Regenerate with changes"),
        el("button", {
          className: "primary",
          onclick: () => publish(site.id),
        }, site.published_url ? "Publish again" : "Publish this version"),
        site.published_url
          ? el("a", { href: site.published_url, target: "_blank", rel: "noreferrer noopener", style: "align-self:center" }, "view published")
          : null,
      ),
      el("p", { className: "hint" },
        state.meta.publishTargets.find((t) => t.id === "local")?.describe ??
          "Writes the page to the local published folder."),
    ),
  );
}

/* -------------------------------- actions -------------------------------- */

async function revalidate() {
  const id = state.selectedId;
  const { business } = await api(`/api/businesses/${encodeURIComponent(id)}/revalidate`, { method: "POST" });
  state.detail.business = business;
  state.leads = state.leads.map((b) => (b.id === id ? { ...b, ...business } : b));
  renderLeads(state.leads);
  renderDetail();
}

async function setStatus(status) {
  const id = state.selectedId;
  const { business } = await api(`/api/businesses/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  state.detail.business = business;
  state.leads = state.leads.map((b) => (b.id === id ? { ...b, ...business } : b));
  renderLeads(state.leads);
  renderDetail();
}

function generate({ design, feedback = null, previousSiteId = null }) {
  const id = state.selectedId;
  clearLog("#genLog");
  const button = $("#generate");
  button.disabled = true;
  button.textContent = feedback ? "Revising..." : "Generating...";

  const params = new URLSearchParams({ design });
  if (feedback) params.set("feedback", feedback);
  if (previousSiteId) params.set("previousSiteId", String(previousSiteId));

  const source = new EventSource(`/api/businesses/${encodeURIComponent(id)}/generate/stream?${params}`);
  let thinkingLine = null;

  source.addEventListener("progress", (e) => {
    const d = JSON.parse(e.data);
    if (d.type === "start") log("#genLog", `v${d.version} · ${d.design} · ${d.model}`);
    if (d.type === "note") log("#genLog", d.message);
    if (d.type === "thinking") {
      if (!thinkingLine) { thinkingLine = el("div", { style: "color:var(--dim)" }); $("#genLog").append(thinkingLine); }
      thinkingLine.textContent += d.chunk ?? d.text ?? "";
      $("#genLog").scrollTop = $("#genLog").scrollHeight;
    }
    if (d.type === "delta" && d.bytes) {
      const node = $("#genLog");
      let counter = node.querySelector(".counter");
      if (!counter) { counter = el("div", { className: "counter" }); node.append(counter); }
      counter.textContent = `writing HTML... ${(d.bytes / 1024).toFixed(1)} kB`;
      node.scrollTop = node.scrollHeight;
    }
  });

  source.addEventListener("result", async (e) => {
    const d = JSON.parse(e.data);
    log("#genLog", `done: v${d.site.version}, ${kb(d.site.bytes)}, ${d.site.output_tokens} output tokens`);
    source.close();
    button.disabled = false;
    button.textContent = "Generate website";
    state.detail = await api(`/api/businesses/${encodeURIComponent(id)}`);
    state.activeSiteId = d.site.id;
    renderDetail();
  });

  source.addEventListener("error", (e) => {
    const message = e.data ? JSON.parse(e.data).message : "Connection to the server was lost";
    log("#genLog", `error: ${message}`, "err");
    source.close();
    button.disabled = false;
    button.textContent = "Generate website";
  });
}

async function publish(siteId) {
  try {
    const result = await api(`/api/sites/${siteId}/publish`, {
      method: "POST",
      body: JSON.stringify({ target: "local" }),
    });
    state.detail = await api(`/api/businesses/${encodeURIComponent(state.selectedId)}`);
    renderDetail();
    window.open(result.url, "_blank", "noopener");
  } catch (err) {
    log("#genLog", `publish failed: ${err.message}`, "err");
  }
}

boot().catch((err) => {
  document.body.prepend(el("div", { className: "notice", style: "margin:16px" }, `Could not start: ${err.message}`));
});
