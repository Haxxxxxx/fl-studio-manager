// The Digger's converter link (Settings → Digger). Hivo never calls these
// sites and never downloads audio: the link opens in the user's browser.
// Two helpers make the `{url}` slot easy to get right:
// - `templateFromExample`: the address of a converter page *after* a video
//   link was pasted on it usually carries that link (plain or
//   percent-encoded); swapping it for `{url}` gives the template, whatever
//   the site.
// - `KNOWN_CONVERTERS`: a few sites whose link format is known, so pasting
//   their home page is enough.

/** A YouTube video link as it appears plain inside another address:
 * watch?v=, youtu.be/ or /shorts/ with the 11-char id. Nothing after the id
 * is claimed: a `&f=mp3` there is the site's own parameter. */
const VIDEO_LINK = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[A-Za-z0-9_-]{11}/;
/** The same, percent-encoded (`encodeURIComponent`), where the link's own
 * `%26t%3D…` parameters are unmistakably part of it. */
const VIDEO_LINK_ENCODED =
  /https%3A%2F%2F(?:www\.|m\.)?(?:youtube\.com%2Fwatch%3Fv%3D[A-Za-z0-9_-]{11}(?:%26[A-Za-z0-9_%.-]*)*|youtu\.be%2F[A-Za-z0-9_-]{11}(?:%3F[A-Za-z0-9_%.-]*)?|youtube\.com%2Fshorts%2F[A-Za-z0-9_-]{11})/i;

/** The `{url}` template a converter page's address implies, or null when
 * no video link is inside it. The address is kept as typed apart from the
 * link, plain or percent-encoded. */
export function templateFromExample(address: string): string | null {
  const a = address.trim();
  if (!a.startsWith("https://") || a.includes("{url}")) return null;
  const plain = a.match(VIDEO_LINK);
  if (plain) return a.replace(plain[0], "{url}");
  const encoded = a.match(VIDEO_LINK_ENCODED);
  if (encoded) return a.replace(encoded[0], "{url}");
  // Encoded another way (e.g. only ":" and "/" escaped): rebuild from the
  // decoded form, which the site accepts too.
  let decoded: string;
  try {
    decoded = decodeURIComponent(a);
  } catch {
    return null;
  }
  const inside = decoded.match(VIDEO_LINK);
  return inside ? decoded.replace(inside[0], "{url}") : null;
}

export interface KnownConverter {
  /** Host (without www.) the user's link is matched on. */
  host: string;
  name: string;
  /** The link with the slot, when the site reads the address from its
   * link; null when it only takes it on the page (paste). */
  template: string | null;
}

/** Sites whose link format is known. Only formats checked against the
 * site's own code or docs go here (date noted); a `null` template means
 * the site is recognized but no pre-fill format is known. Anything not
 * listed works through `templateFromExample` or the clipboard. */
export const KNOWN_CONVERTERS: KnownConverter[] = [
  // web/src/components/save/Omnibox.svelte reads `#<link>` (or `?u=`) and
  // decodes it (checked 2026-10-24).
  { host: "cobalt.tools", name: "cobalt", template: "https://cobalt.tools/#{url}" },
  { host: "notube.lol", name: "NoTube", template: null },
];

/** The known site a converter link belongs to, if any. */
export function knownConverter(address: string): KnownConverter | null {
  let host: string;
  try {
    host = new URL(address.trim()).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  return KNOWN_CONVERTERS.find((c) => host === c.host || host.endsWith(`.${c.host}`)) ?? null;
}

/** What to save for what the user typed: a template from an example
 * address, the known site's template for a bare page of a known site, else
 * the address itself. */
export function converterTemplateFor(address: string): { template: string; recognized: "example" | "known" | null; site: KnownConverter | null } {
  const a = address.trim();
  const site = knownConverter(a);
  const fromExample = templateFromExample(a);
  if (fromExample) return { template: fromExample, recognized: "example", site };
  if (site?.template && !a.includes("{url}")) return { template: site.template, recognized: "known", site };
  return { template: a, recognized: null, site };
}
