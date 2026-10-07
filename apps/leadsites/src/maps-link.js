/**
 * Turn whatever someone pasted into something searchable.
 *
 * People identify a business by sending a link, and there are several shapes of
 * Google link. Only some of them carry anything this app can use:
 *
 *   /maps/place/<Name>/@lat,lng,...   the name is right there in the path
 *   ?q=<Name>                         likewise
 *   ?q=place_id:ChIJ...               an actual Places API place id
 *   share.google/<code>               nothing at all until a browser opens it
 *
 * The `!1s0x88e5b7...:0x...` identifier inside a maps URL's `data=` segment is
 * an ftid, not a Places API place id, so it is deliberately ignored rather than
 * passed to an API that will reject it.
 *
 * Returns `{ query }` or `{ placeId }` with a `from` label, or `{ error }` with
 * an explanation worth printing - never a guess.
 */
export function parseMapsLink(input) {
  const text = String(input ?? "").trim();
  if (!text) return { error: "Nothing to look up." };
  if (!/^https?:\/\//i.test(text)) return { query: text, from: "text" };

  let url;
  try {
    url = new URL(text);
  } catch {
    return { query: text, from: "text" };
  }

  const placeId = /place_id:([A-Za-z0-9_-]+)/.exec(url.search)?.[1];
  if (placeId) return { placeId, from: "url place_id" };

  const place = /\/place\/([^/@]+)/.exec(url.pathname)?.[1];
  if (place) {
    const name = decodeURIComponent(place).replace(/\+/g, " ").trim();
    if (name) return { query: name, from: "url /place/ segment" };
  }

  const q = url.searchParams.get("q");
  if (q && !/^-?\d+\.\d+,/.test(q)) return { query: q, from: "url q parameter" };

  return {
    error:
      /^share\.google$/i.test(url.hostname) || /goo\.gl$/i.test(url.hostname)
        ? "That is a short link. It carries no business name until it is opened, and this app cannot follow it. Open it in a browser, then paste the /maps/place/... URL it lands on, or just the business name and city."
        : "Could not find a business name in that URL. Open it in a browser, then paste the /maps/place/... URL it lands on, or just the business name and city.",
  };
}
