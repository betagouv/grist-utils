import { browser, expect } from "@wdio/globals";
import HomePage from "../pageobjects/homepage.page.js";

const MAINTENANCE_JSON_URL =
  process.env.MAINTENANCE_JSON_URL ||
  "https://gristgouv.github.io/next-maintenance/maintenance-preprod.json";

// The mocked response is not based on Github's one, so we must provide the CORS header.
const RESPONSE_PARAMS = {
  headers: {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  },
};

describe("Maintenance Popin", () => {
  let mock;
  let clock;
  let logs;

  function logEvents(event) {
    logs.push({
      text: event.text,
      level: event.level,
    });
  }

  function containsLog(level, text) {
    return logs.some(
      (entry) => entry.level === level && entry.text?.includes(text),
    );
  }

  async function waitForLog(level, text) {
    await browser.waitUntil(async () => containsLog(level, text), {
      timeoutMsg: `Expected a log of level "${level}" containing "${text}". Got: ${JSON.stringify(logs)}`,
    });
  }

  async function openHomePage({ waitForApiCall } = { waitForApiCall: true }) {
    // Don't acknowledge the popin: we want to check whether it is displayed.
    await HomePage.open({ acknowledgeMaintenance: false });
    if (waitForApiCall) {
      await browser.waitUntil(() => mock.calls.length > 0);
    }
  }

  before(async () => {
    clock = await browser.emulate("clock", {
      now: new Date("2026-01-01T11:00:00+0100"),
      // Grist relies on timers to render the page, so let the time flow.
      shouldAdvanceTime: true,
    });
    await browser.sessionSubscribe({ events: ["log.entryAdded"] });
    browser.on("log.entryAdded", logEvents);
  });

  beforeEach(async () => {
    logs = [];
    mock = await browser.mock(MAINTENANCE_JSON_URL, { method: "get" });
  });

  afterEach(async () => {
    await browser.mockRestoreAll();
    // Forget any maintenance acknowledgement, so the popin may show up again.
    await browser.execute(() => {
      localStorage.removeItem("maintenanceStartDateAgreement");
    });
  });

  after(async () => {
    await clock.restore();
    browser.off("log.entryAdded", logEvents);
  });

  it("should display a maintenance popin when the fetched JSON announce an upcoming one with total interruption", async () => {
    // Given
    mock.respond(
      {
        tz: "CET",
        startDate: "2026-01-02T19:00:00",
        durationMinutes: 30,
        completeInterruption: true,
      },
      RESPONSE_PARAMS,
    );

    // When
    await openHomePage();

    // Then
    await expect(HomePage.maintenancePopin).toBeDisplayed();
    await expect(HomePage.maintenancePopin).toHaveText(
      expect.stringContaining(
        "Une maintenance de Grist est prévue le vendredi 2 janvier 2026 à 19:00 heure de Paris jusqu'à 19:30",
      ),
    );
    await expect(HomePage.maintenancePopin).toHaveText(
      expect.stringContaining("totalement indisponible"),
    );

    // When
    await HomePage.acknowledgeMaintenance();

    // Then
    await expect(HomePage.maintenancePopin).not.toBeDisplayed();
    await expect(HomePage.addNew).toBeDisplayed();
  });

  it("should display a maintenance popin with instabilities", async () => {
    // Given
    mock.respond(
      {
        tz: "CET",
        startDate: "2026-01-02T19:00:00",
        durationMinutes: 60,
        completeInterruption: false,
      },
      RESPONSE_PARAMS,
    );

    // When
    await openHomePage();

    // Then
    await expect(HomePage.maintenancePopin).toBeDisplayed();
    await expect(HomePage.maintenancePopin).toHaveText(
      expect.stringContaining("jusqu'à 20:00"),
    );
    await expect(HomePage.maintenancePopin).toHaveText(
      expect.stringContaining("connaître des instabilités"),
    );
  });

  it("should not announce maintenance in the past", async () => {
    // Given
    mock.respond(
      {
        tz: "CET",
        startDate: "2026-01-01T00:00:00",
        durationMinutes: 60,
        completeInterruption: false,
      },
      RESPONSE_PARAMS,
    );

    // When
    await openHomePage();

    // Then
    await expect(HomePage.maintenancePopin).not.toBeDisplayed();
    await expect(HomePage.addNew).toBeDisplayed();
  });

  it("should not announce maintenance when the browser takes more than 3 seconds to fetch the JSON", async () => {
    // Given
    // Intercept the request without ever answering it, so the fetch hangs.
    await mock.restore();
    const { intercept } = await browser.networkAddIntercept({
      phases: ["beforeRequestSent"],
      urlPatterns: [{ type: "string", pattern: MAINTENANCE_JSON_URL }],
    });

    try {
      // When
      await openHomePage({ waitForApiCall: false });
      // Timers are faked, so make the abort timeout elapse.
      await clock.tick(3500);

      // Then
      await waitForLog("error", "Maintenance info: fetch aborted after");
      await expect(HomePage.maintenancePopin).not.toBeDisplayed();
      await expect(HomePage.addNew).toBeDisplayed();
    } finally {
      await browser.networkRemoveIntercept({ intercept });
    }
  });

  it("should not announce maintenance when the JSON contains an error", async () => {
    // Given
    mock.respond(
      {
        tz: "CET",
        startDate: "not a date",
        durationMinutes: 60,
        completeInterruption: false,
      },
      RESPONSE_PARAMS,
    );

    // When
    await openHomePage();

    // Then
    await waitForLog(
      "error",
      "[custom-maintenance.js]  Error: Start date is invalid",
    );
    await expect(HomePage.maintenancePopin).not.toBeDisplayed();
    await expect(HomePage.addNew).toBeDisplayed();
  });

  it("should work when Github responds with no CORS header", async () => {
    // Given
    // Overwriting the headers drops the "Access-Control-Allow-Origin" one.
    mock.respond(
      {
        tz: "CET",
        startDate: "2026-01-02T19:00:00",
        durationMinutes: 60,
        completeInterruption: false,
      },
      {
        headers: { "content-type": "application/json" },
      },
    );

    // When
    await openHomePage();

    // Then
    await waitForLog("error", "[custom-maintenance.js]");
    await waitForLog("error", "Access-Control-Allow-Origin");
    await expect(HomePage.maintenancePopin).not.toBeDisplayed();
    await expect(HomePage.addNew).toBeDisplayed();
  });

  it("should work when Github responds with an HTTP error", async () => {
    // Given
    mock.respond("Not Found", { ...RESPONSE_PARAMS, statusCode: 404 });

    // When
    await openHomePage();

    // Then
    await waitForLog(
      "error",
      "[custom-maintenance.js]  Error: Cannot fetch the maintenance information JSON (HTTP status code: 404)",
    );
    await expect(HomePage.maintenancePopin).not.toBeDisplayed();
    await expect(HomePage.addNew).toBeDisplayed();
  });
});
