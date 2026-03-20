import { describe, expect, it } from "vitest";

import { buildSearchHref, readSearchState } from "@/lib/search";
import { getSearchCollections, paginateItems } from "@/lib/search-catalog";

describe("search state", () => {
  it("parses query params and clamps invalid values", () => {
    const state = readSearchState({
      q: "月光",
      view: "slot",
      page: "-3",
      pageSize: "999"
    });

    expect(state.q).toBe("月光");
    expect(state.view).toBe("slot");
    expect(state.page).toBe(1);
    expect(state.pageSize).toBe(5);
  });

  it("builds hrefs while preserving the current state", () => {
    const href = buildSearchHref(
      "/search",
      {
        q: "月光",
        year: "2024",
        quarter: "",
        weekday: "",
        timeBand: "",
        channel: "",
        region: "",
        slot: "",
        genre: "",
        company: "",
        sequel: "",
        duration: "",
        view: "title",
        sort: "title",
        page: 2,
        pageSize: 10
      },
      {
        view: "airing",
        page: 1
      }
    );

    expect(href).toContain("/search?");
    expect(href).toContain("q=%E6%9C%88%E5%85%89");
    expect(href).toContain("year=2024");
    expect(href).toContain("view=airing");
    expect(href).toContain("sort=title");
    expect(href).toContain("pageSize=10");
    expect(href).not.toContain("page=2");
  });
});

describe("search collections", () => {
  it("derives title / airing / slot counts from the same filtered airings", () => {
    const collections = getSearchCollections({
      q: "",
      year: "2024",
      quarter: "",
      weekday: "TUE",
      timeBand: "",
      channel: "",
      region: "",
      slot: "",
      genre: "",
      company: "",
      sequel: "",
      duration: "",
      view: "title",
      sort: "latest",
      page: 1,
      pageSize: 5
    });

    expect(collections.counts.title).toBe(2);
    expect(collections.counts.airing).toBe(2);
    expect(collections.counts.slot).toBe(1);
    expect(collections.titleResults.map((entry) => entry.title.slug)).toEqual(
      expect.arrayContaining(["moonlight-signal", "august-archive"])
    );
  });

  it("supports sequel and duration filters together", () => {
    const collections = getSearchCollections({
      q: "",
      year: "",
      quarter: "",
      weekday: "",
      timeBand: "",
      channel: "",
      region: "",
      slot: "",
      genre: "",
      company: "",
      sequel: "only",
      duration: "HALF_15",
      view: "title",
      sort: "latest",
      page: 1,
      pageSize: 5
    });

    expect(collections.counts.title).toBe(1);
    expect(collections.titleResults[0]?.title.slug).toBe("kyomachi-resonance-s2");
  });
});

describe("search pagination", () => {
  it("paginates airing results and returns the visible range", () => {
    const collections = getSearchCollections({
      q: "",
      year: "",
      quarter: "",
      weekday: "",
      timeBand: "",
      channel: "",
      region: "",
      slot: "",
      genre: "",
      company: "",
      sequel: "",
      duration: "",
      view: "airing",
      sort: "latest",
      page: 1,
      pageSize: 5
    });

    const paginated = paginateItems(collections.airingResults, 2, 5);

    expect(paginated.page).toBe(2);
    expect(paginated.pageSize).toBe(5);
    expect(paginated.items).toHaveLength(5);
    expect(paginated.startIndex).toBe(6);
    expect(paginated.endIndex).toBe(10);
  });
});
