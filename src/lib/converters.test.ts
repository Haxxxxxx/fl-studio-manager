import { describe, expect, it } from "vitest";
import { converterTemplateFor, knownConverter, templateFromExample } from "./converters";

const video = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("templateFromExample", () => {
  it("swaps a plain or encoded video link for {url}", () => {
    expect(templateFromExample(`https://example.com/convert?u=${video}`)).toBe("https://example.com/convert?u={url}");
    expect(templateFromExample(`https://example.com/convert?u=${encodeURIComponent(video)}&f=mp3`)).toBe("https://example.com/convert?u={url}&f=mp3");
    expect(templateFromExample(`https://example.com/convert?u=${encodeURIComponent(`${video}&t=42s`)}&f=mp3`)).toBe("https://example.com/convert?u={url}&f=mp3");
    // Plain: what follows the id stays (a site's own parameter, or the
    // link's, which the site reads the same way).
    expect(templateFromExample("https://example.com/#https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("https://example.com/#{url}?si=abc");
    expect(templateFromExample("https://example.com/x/https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("https://example.com/x/{url}");
    // Encoded differently from encodeURIComponent: rebuilt from the decoded form.
    expect(templateFromExample("https://example.com/?u=https%3A//www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://example.com/?u={url}");
  });

  it("gives null without a video link, a template already, or https", () => {
    expect(templateFromExample("https://notube.lol/fr/youtube-app-445")).toBeNull();
    expect(templateFromExample("https://example.com/?u={url}")).toBeNull();
    expect(templateFromExample(`http://example.com/?u=${video}`)).toBeNull();
    expect(templateFromExample("https://example.com/?u=%E0%A4%A")).toBeNull();
  });
});

describe("known converters", () => {
  it("recognizes a known site by host", () => {
    expect(knownConverter("https://cobalt.tools/")?.name).toBe("cobalt");
    expect(knownConverter("https://www.notube.lol/fr/youtube-app-445")?.name).toBe("NoTube");
    expect(knownConverter("https://notube.lol.evil.com/")).toBeNull();
    expect(knownConverter("not a url")).toBeNull();
  });

  it("picks the template to save", () => {
    expect(converterTemplateFor("https://cobalt.tools/")).toMatchObject({ template: "https://cobalt.tools/#{url}", recognized: "known" });
    expect(converterTemplateFor("https://notube.lol/fr/youtube-app-445")).toMatchObject({ template: "https://notube.lol/fr/youtube-app-445", recognized: null });
    expect(converterTemplateFor(`https://notube.lol/fr/go?v=${video}`)).toMatchObject({ template: "https://notube.lol/fr/go?v={url}", recognized: "example" });
    expect(converterTemplateFor("https://cobalt.tools/#{url}")).toMatchObject({ template: "https://cobalt.tools/#{url}", recognized: null });
  });
});
