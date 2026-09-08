import { describe, it, expect } from "vitest";
import { extractMentions } from "../src/services/comment.service";

describe("extractMentions", () => {
  it("returns an empty array when there are no mentions", () => {
    expect(extractMentions("just a plain comment")).toEqual([]);
  });

  it("extracts a single mention without the leading @", () => {
    expect(extractMentions("hey @alice look at this")).toEqual(["alice"]);
  });

  it("extracts multiple distinct mentions", () => {
    expect(extractMentions("@alice and @bob please review")).toEqual(["alice", "bob"]);
  });

  it("lowercases and de-duplicates repeated mentions", () => {
    expect(extractMentions("@Alice @alice @ALICE")).toEqual(["alice"]);
  });

  it("supports dots, underscores, and hyphens in handles", () => {
    expect(extractMentions("@jane.doe @john_smith @a-b")).toEqual([
      "jane.doe",
      "john_smith",
      "a-b",
    ]);
  });

  it("ignores a bare @ with no handle", () => {
    expect(extractMentions("email me @ the office")).toEqual([]);
  });
});
