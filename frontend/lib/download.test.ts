import { describe, expect, it } from "vitest";
import { adFileName, videoExt } from "./download";

describe("videoExt", () => {
  it("reads the extension from the saved URL", () => {
    expect(videoExt("https://x/abc.webm")).toBe("webm");
    expect(videoExt("https://x/abc.mp4")).toBe("mp4");
  });

  it("ignores a query string / fragment after the extension", () => {
    expect(videoExt("https://cdn/v/abc.webm?token=9&v=2")).toBe("webm");
    expect(videoExt("https://cdn/v/abc.mp4#t=3")).toBe("mp4");
  });

  it("falls back to the blob MIME type when the URL has no extension", () => {
    expect(videoExt("blob:https://app/uuid", "video/webm")).toBe("webm");
    expect(videoExt(undefined, "video/webm;codecs=vp9")).toBe("webm");
    expect(videoExt("blob:https://app/uuid", "video/mp4")).toBe("mp4");
  });

  it("defaults to mp4 when nothing is known", () => {
    expect(videoExt()).toBe("mp4");
    expect(videoExt(null, null)).toBe("mp4");
    expect(videoExt("https://x/no-extension")).toBe("mp4");
  });

  it("does not match .webm embedded elsewhere in the path", () => {
    expect(videoExt("https://x/webm-notes/clip.mp4")).toBe("mp4");
  });
});

describe("adFileName", () => {
  it("carries the extension through", () => {
    expect(adFileName("Aero Runner", "16:9", "abcd1234", "webm")).toBe(
      "dart-aero-runner-16x9.webm",
    );
    expect(adFileName("Aero Runner", "16:9", "abcd1234")).toBe(
      "dart-aero-runner-16x9.mp4",
    );
  });

  it("falls back to the id when there's no usable title", () => {
    expect(adFileName("", "1:1", "abcd1234efgh", "webm")).toBe(
      "dart-abcd1234-1x1.webm",
    );
  });
});
