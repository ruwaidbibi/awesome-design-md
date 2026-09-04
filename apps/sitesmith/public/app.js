const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const kid of kids.flat()) {
    if (kid != null) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
};

/** Like el()'s child handling: append() alone would stringify a null into "null". */
const append = (node, ...kids) => {
  for (const kid of kids.flat()) {
    if (kid != null) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
};

const state = { meta: null, leads: [], selectedId: null, detail: null, activeSiteId: null, activePage: "index.html", stream: null };

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

  $("#city").replaceChildren(
    el("option", { value: "" }, `Anywhere in the ${m.metro.label}`),
    ...m.cities.map((c) => el("option", { value: c.name }, `${c.name}, ${c.state} (${c.county})`)),
  );
  $("#city").value = localStorage.getItem("sitesmith:city") ?? "";
  $("#city").addEventListener("change", () => localStorage.setItem("sitesmith:city", $("#city").value));
  $("#categories").replaceChildren(...m.categories.map((c) => el("option", { value: c })));

  const hints = [`Scoped to the ${m.metro.label}; results outside it are rejected by the API itself.`];
  if (!m.placesKeyPresent) {
    hints.push("No GOOGLE_MAPS_API_KEY, so searches return sample businesses. Everything downstream is real.");
  } else {
    hints.push(`Up to ${m.maxPages * 20} results per query, one billed request per page.`);
  }
  $("#searchHint").textContent = hints.join(" ");

  $("#search").addEventListener("click", runSearch);
  $("#loadAll").addEventListener("click", loadSaved);
  for (const id of ["#q", "#minReviews"]) {
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
    city: $("#city").value,
    minReviews: $("#minReviews").value || "0",
    includeLiveSites: String($("#includeLive").checked),
  });

  const source = new EventSource(`/api/prospect/stream?${params}`);
  state.stream = source;

  source.addEventListener("progress", (e) => {
    const d = JSON.parse(e.data);
    if (d.phase === "searching") log("#searchLog", `searching ${d.provider}: "${d.query}"${d.location ? ` in ${d.location}` : ` across the ${d.metro}`}`);
    if (d.phase === "fenced") log("#searchLog", `${d.dropped} result(s) fell outside the ${d.metro} and were dropped`);
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

  /* content */
  node.querySelector('[data-slot="content"]').replaceChildren(renderContent(business));

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

  /* plan */
  const active = sites.find((x) => x.id === state.activeSiteId) ?? sites[0];
  if (active?.plan) {
    node.querySelector('[data-slot="planCard"]').hidden = false;
    node.querySelector('[data-slot="planMeta"]').textContent =
      `v${active.version} · ${active.plan.pages.length} page(s)` +
      (active.weak?.length ? ` · ${active.weak.length} weakly supported` : "");
    node.querySelector('[data-slot="plan"]').replaceChildren(renderPlan(active));
  }

  /* versions + preview */
  if (sites.length > 0) {
    node.querySelector('[data-slot="versionsCard"]').hidden = false;
    node.querySelector('[data-slot="versions"]').replaceChildren(...sites.map(renderVersion));
    node.querySelector('[data-slot="preview"]').replaceChildren(renderPreview());
  }

  $("#detailCol").replaceChildren(node);
}

function renderPlan(site) {
  const plan = site.plan;
  const wrap = el("div", {});
  if (!plan) return wrap;

  const weakKeys = new Set((site.weak ?? []).map((w) => `${w.page}|${w.heading}`));

  append(wrap,
    el("p", { className: "evidence" }, `"${plan.tagline}"`),
    el("p", { className: "hint" }, plan.voice),
  );

  plan.pages.forEach((page, pageIndex) => {
    const sections = (page.sections ?? []).map((section, sectionIndex) =>
      el("div", { className: "plan-section" },
        el("h5", {},
          section.heading,
          el("span", { className: `conf-${section.confidence}` }, section.confidence),
          el("button", {
            className: "tiny",
            title: "Remove this section from the plan",
            onclick: () => removeSection(site, pageIndex, sectionIndex),
          }, "remove"),
          weakKeys.has(`${page.slug}|${section.heading}`)
            ? el("span", { className: "conf-low" }, "nothing specific supports this")
            : null,
        ),
        el("p", {}, section.body),
        section.items?.length
          ? el("ul", {}, ...section.items.map((i) =>
              el("li", {}, i.detail ? `${i.name} - ${i.detail}` : i.name)))
          : null,
        section.placeholders?.length
          ? el("p", { className: "hint" }, `Owner supplies: ${section.placeholders.join("; ")}`)
          : null,
        el("div", { className: "ev" }, ...(section.evidence ?? []).map((e) =>
          el("span", { className: e.source, title: e.supports },
            e.ref ? `${e.source}: ${e.ref}` : e.source))),
      ));

    append(wrap,
      el("div", { className: "plan-page" },
        el("h4", {}, `${page.navLabel} — ${page.slug}.html`),
        el("p", { className: "purpose" }, page.purpose),
        ...sections),
    );
  });

  if (plan.ownerTodos?.length) {
    append(wrap,
      el("h4", { style: "font-size:12px;color:var(--muted);margin:14px 0 2px;text-transform:uppercase;letter-spacing:.06em" }, "The owner still has to supply"),
      el("ul", { className: "plan-list" }, ...plan.ownerTodos.map((t) => el("li", {}, t))));
  }
  if (plan.claimsAvoided?.length) {
    append(wrap,
      el("h4", { style: "font-size:12px;color:var(--muted);margin:14px 0 2px;text-transform:uppercase;letter-spacing:.06em" }, "Deliberately not claimed"),
      el("ul", { className: "plan-list" }, ...plan.claimsAvoided.map((t) => el("li", {}, t))));
  }

  append(wrap,
    el("div", { className: "row", style: "margin-top:12px" },
      el("button", {
        disabled: !state.meta.generationReady,
        onclick: () => rebuild(site.id),
      }, "Rebuild the site from this plan")),
    el("p", { className: "hint" },
      "Removing a section takes it out of the plan. Rebuilding re-renders every page from the plan without planning again."));

  return wrap;
}

function renderContent(business) {
  const c = business.content ?? {};
  const wrap = el("div", {});

  const fetchButton = el("button", {
    className: c.usable ? "tiny" : "primary",
    disabled: !state.meta.placesKeyPresent && state.meta.provider !== "fixtures",
    onclick: () => loadDetails(Boolean(c.fetchedAt)),
  }, c.fetchedAt ? "Re-fetch reviews" : "Fetch reviews from Google");

  if (!c.fetchedAt) {
    append(wrap,
      el("p", { className: "hint" },
        "Reviews are what tell the site which services to feature. They are a separate Google call in a higher pricing tier, so they are fetched only for the business you choose, not for every search result."),
      fetchButton,
    );
  } else {
    const age = c.ageDays == null ? "unknown age"
      : c.ageDays < 1 ? "fetched today"
      : `fetched ${Math.round(c.ageDays)} day(s) ago`;

    if (c.stale) {
      append(wrap, el("p", { className: "notice" },
        `Review data is older than ${state.meta.detailsTtlDays} days, which is the limit Google's terms allow it to be cached for. It is being ignored until re-fetched.`));
    }

    append(wrap,
      el("p", { className: "hint" },
        c.stale
          ? `${c.storedCount} review(s) stored but not in use, ${age}.`
          : `${c.reviews.length} review(s) on file, ${age}. Used as research only: the generator is instructed never to quote or paraphrase them, and never to name a reviewer.`),
      c.editorialSummary ? el("p", { className: "evidence" }, c.editorialSummary) : null,
      el("ul", { className: "plain" }, ...c.reviews.slice(0, 8).map((r) =>
        el("li", { style: "display:block" },
          el("span", { className: "conf" }, `${r.rating ?? "?"}★ · ${r.when ?? "undated"}`),
          el("div", { style: "color:var(--muted)" }, r.text)))),
      el("div", { className: "row", style: "margin-top:10px" }, fetchButton),
    );
  }

  const notes = el("textarea", {
    id: "ownerNotes",
    value: business.notes ?? "",
    placeholder: "Anything you know that Google doesn't: what you saw on their Facebook page, what they told you on the phone, services they offer. Treated as verified fact by the generator.",
  });

  const v = business.vision;
  if (state.meta.photoVision) {
    append(wrap,
      el("h4", { style: "font-size:12px;color:var(--muted);margin:16px 0 4px;text-transform:uppercase;letter-spacing:.06em" }, "What their photos show"),
      v?.usable
        ? el("div", {},
            el("p", { className: "evidence" }, v.scene),
            v.signals?.length ? el("p", { className: "hint" }, v.signals.join(" · ")) : null,
            v.palette?.length
              ? el("div", { className: "ev" }, ...v.palette.map((c) =>
                  el("span", { title: c.where, style: `border-left:10px solid ${c.hex}` }, `${c.hex} · ${c.where}`)))
              : null)
        : el("p", { className: "hint" }, v ? `No usable photos: ${v.reason ?? "unreadable"}` : "Not analysed yet."),
      el("div", { className: "row", style: "margin-top:8px" },
        el("button", { className: "tiny", onclick: analyzePhotos }, v ? "Re-read photos" : "Read their photos")),
      el("p", { className: "hint" },
        "Photos are read once and discarded. They never reach the generated site: Google's terms require photos to be fetched live with attribution, which a static page cannot do."));
  }

  append(wrap,
    el("div", { className: "field", style: "margin-top:14px" },
      el("label", { htmlFor: "ownerNotes" }, "Your own notes on this business"),
      notes),
    el("div", { className: "row" },
      el("button", { className: "tiny", onclick: () => saveNotes(notes.value) }, "Save notes")),
    el("p", { className: "hint" },
      "Social profiles are linked on the generated site, but their content is not read: there is no supported way to pull posts from Facebook or Instagram without the business's own permission."),
  );

  return wrap;
}

function renderVersion(site) {
  const row = el("div", { className: "version" },
    el("strong", {}, `v${site.version}`),
    el("span", { className: "grow sub" },
      [site.design_key,
       site.status,
       site.pages?.length ? `${site.pages.length} page(s)` : null,
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

  const pages = site.pages?.length ? site.pages : [{ slug: "index", file: "index.html", title: site.title }];
  const current = pages.find((p) => p.file === state.activePage) ?? pages[0];

  const frame = el("iframe", {
    className: "preview",
    src: `/preview/${site.id}/${current.file}`,
    title: `Preview of ${state.detail.business.name} website, ${current.file}`,
  });
  frame.dataset.vp = "desktop";

  const tabs = el("div", { className: "page-tabs" }, ...pages.map((page) => {
    const button = el("button", {
      className: "tiny",
      onclick: () => {
        state.activePage = page.file;
        frame.src = `/preview/${site.id}/${page.file}`;
        for (const b of tabs.children) b.setAttribute("aria-current", String(b === button));
      },
    }, page.slug === "index" ? "Home" : page.slug);
    button.setAttribute("aria-current", String(page.file === current.file));
    return button;
  }));

  const vpButton = (id, label) =>
    el("button", { className: "tiny", onclick: () => { frame.dataset.vp = id; } }, label);

  const feedback = el("textarea", {
    placeholder: "What should change? e.g. warmer hero, put the phone number in the header, drop the FAQ",
  });

  return el("div", {},
    pages.length > 1 ? el("div", { className: "preview-bar" }, tabs) : null,
    el("div", { className: "preview-bar" },
      vpButton("desktop", "Desktop"), vpButton("tablet", "Tablet"), vpButton("phone", "Phone"),
      el("span", { className: "spacer" }),
      el("a", { href: `/preview/${site.id}/${current.file}`, target: "_blank", rel: "noreferrer noopener" }, "open"),
      el("a", { href: `/api/sites/${site.id}/source?file=${current.file}`, target: "_blank", rel: "noreferrer noopener" }, "source"),
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

async function analyzePhotos() {
  const id = state.selectedId;
  try {
    log("#genLog", "reading their photos...");
    const { business, billedRequests } = await api(`/api/businesses/${encodeURIComponent(id)}/photos`, { method: "POST" });
    state.detail.business = business;
    renderDetail();
    log("#genLog", `photos read (${billedRequests} billed request(s))`);
  } catch (err) {
    log("#genLog", `photo analysis failed: ${err.message}`, "err");
  }
}

async function removeSection(site, pageIndex, sectionIndex) {
  const plan = structuredClone(site.plan);
  plan.pages[pageIndex].sections.splice(sectionIndex, 1);
  if (plan.pages[pageIndex].sections.length === 0) plan.pages.splice(pageIndex, 1);
  try {
    await api(`/api/sites/${site.id}/plan`, { method: "PATCH", body: JSON.stringify({ plan }) });
    state.detail = await api(`/api/businesses/${encodeURIComponent(state.selectedId)}`);
    renderDetail();
  } catch (err) {
    log("#genLog", `could not update the plan: ${err.message}`, "err");
  }
}

function rebuild(siteId) {
  runGenerationStream(`/api/sites/${siteId}/rebuild/stream`, "Rebuilding...");
}

async function loadDetails(force = false) {
  const id = state.selectedId;
  try {
    const { business, billedRequests, cached } = await api(`/api/businesses/${encodeURIComponent(id)}/details`, {
      method: "POST",
      body: JSON.stringify({ force }),
    });
    state.detail.business = business;
    renderDetail();
    log("#genLog", cached ? "reviews already on file, no request made" : `reviews fetched (${billedRequests} billed request)`);
  } catch (err) {
    log("#genLog", `could not fetch reviews: ${err.message}`, "err");
  }
}

async function saveNotes(notes) {
  const id = state.selectedId;
  const { business } = await api(`/api/businesses/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ notes }),
  });
  state.detail.business = business;
  renderDetail();
}

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
  const params = new URLSearchParams({ design });
  if (feedback) params.set("feedback", feedback);
  if (previousSiteId) params.set("previousSiteId", String(previousSiteId));
  runGenerationStream(
    `/api/businesses/${encodeURIComponent(state.selectedId)}/generate/stream?${params}`,
    feedback ? "Revising..." : "Generating...",
  );
}

/**
 * Drive one generation stream. Shared by "generate", "regenerate with changes"
 * and "rebuild from plan" - they differ only in the URL they open.
 */
function runGenerationStream(url, busyLabel) {
  const id = state.selectedId;
  clearLog("#genLog");
  const button = $("#generate");
  button.disabled = true;
  button.textContent = busyLabel;

  const source = new EventSource(url);
  let thinkingLine = null;

  source.addEventListener("progress", (e) => {
    const d = JSON.parse(e.data);
    if (d.type === "start") log("#genLog", `v${d.version} · ${d.design} · ${d.model}`);
    if (d.type === "note") log("#genLog", d.message);
    if (d.type === "stage") {
      thinkingLine = null;
      log("#genLog", d.stage === "planning" ? "planning what the site should say..." : "building the pages...");
    }
    if (d.type === "plan") {
      log("#genLog", `plan ready: ${d.pages} page(s)${d.weak.length ? `, ${d.weak.length} weakly supported` : ""}`);
    }
    if (d.type === "page") log("#genLog", `  page ${d.index}/${d.total}: ${d.slug}`);
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
    log("#genLog", `done: v${d.site.version}, ${d.pages.length} page(s), ${kb(d.site.bytes)}, ${d.site.output_tokens} output tokens`);
    source.close();
    button.disabled = false;
    button.textContent = "Generate website";
    state.detail = await api(`/api/businesses/${encodeURIComponent(id)}`);
    state.activeSiteId = d.site.id;
    state.activePage = "index.html";
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
