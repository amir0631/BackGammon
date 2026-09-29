import { describe, expect, it } from "vitest";
import type { Announcement } from "@bg/protocol";
import { bannerCandidate, bodyParagraphs, isNewsHost, listableNews, newsText, pruneIds, safeNewsLink } from "./news";

const item = (o: Partial<Announcement>): Announcement => ({
  id: 1,
  kind: "banner",
  title: { fa: "عنوان", en: "Title" },
  body: { fa: "", en: "" },
  link: "",
  published_at: "2026-09-01T00:00:00Z",
  ends_at: null,
  ...o,
});

describe("news rules", () => {
  it("falls back to the other language and skips untitled items", () => {
    expect(newsText(item({}), "en")).toMatchObject({ title: "Title", lang: "en", fallback: false });
    expect(newsText(item({ title: { fa: "عنوان", en: " " }, body: { fa: "متن", en: "" } }), "en")).toMatchObject({ title: "عنوان", body: "متن", lang: "fa", fallback: true });
    expect(newsText(item({ title: { fa: "", en: "" } }), "fa")).toBeNull();
  });

  it("accepts only safe in-app links", () => {
    expect(safeNewsLink("/tournaments")).toBe("/tournaments");
    expect(safeNewsLink("//evil")).toBeNull();
    expect(safeNewsLink("https://x.ir")).toBeNull();
    expect(safeNewsLink("/wallet/transfer")).toBeNull();
    expect(safeNewsLink("/wallet/withdrawals")).toBe("/wallet/withdrawals");
    expect(safeNewsLink("/shop/coins/result?x=1")).toBeNull();
    expect(safeNewsLink("")).toBeNull();
  });

  it("picks the first undismissed banner on tab roots only", () => {
    const items = [item({ id: 1, kind: "announcement" }), item({ id: 2 }), item({ id: 3 })];
    expect(bannerCandidate(items, new Set(), "fa")?.id).toBe(2);
    expect(bannerCandidate(items, new Set([2]), "fa")?.id).toBe(3);
    expect(isNewsHost("/play")).toBe(true);
    expect(isNewsHost("/me")).toBe(false);
    expect(listableNews([...items, item({ id: 9, title: { fa: "", en: "" } })], "en")).toHaveLength(3);
  });

  it("splits paragraphs and prunes ids", () => {
    expect(bodyParagraphs("a\nb\n\n\nc")).toEqual(["a\nb", "c"]);
    expect(pruneIds([1, 2, 5], [{ id: 2 }, { id: 5 }])).toEqual([2, 5]);
  });
});
