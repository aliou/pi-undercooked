import { describe, expect, it } from "vitest";
import { alreadyServingUrl, NURB_URL_RE, urlFromOutput } from "./serve";

describe("urlFromOutput", () => {
  it("finds the URL in a viewer log line", () => {
    expect(
      urlFromOutput("  serving my-parts/parts at http://127.0.0.1:7373"),
    ).toBe("http://127.0.0.1:7373");
  });

  it("returns the first URL when several appear", () => {
    expect(
      urlFromOutput("http://127.0.0.1:7373 then http://127.0.0.1:7374"),
    ).toBe("http://127.0.0.1:7373");
  });

  it("returns null without a loopback URL", () => {
    expect(urlFromOutput("  building parts")).toBeNull();
    expect(urlFromOutput("http://localhost:7373")).toBeNull();
  });

  it("the exported regex matches the loopback URL shape", () => {
    expect(NURB_URL_RE.test("http://127.0.0.1:80")).toBe(true);
  });
});

describe("alreadyServingUrl", () => {
  it("parses nurb's already-serving error", () => {
    const stderr =
      "  nurb dev is already serving this project at http://127.0.0.1:7374\n" +
      "  use that URL; a save reaches it without a restart\n";
    expect(alreadyServingUrl(stderr)).toBe("http://127.0.0.1:7374");
  });

  it("returns null for a taken-port error without a serving twin", () => {
    const stderr =
      "  port 7373 is already in use, most likely by another nurb dev.\n" +
      "  leave --port off and one will be picked for you\n";
    expect(alreadyServingUrl(stderr)).toBeNull();
  });

  it("returns null for unrelated stderr", () => {
    expect(alreadyServingUrl("Traceback: something broke")).toBeNull();
  });
});
