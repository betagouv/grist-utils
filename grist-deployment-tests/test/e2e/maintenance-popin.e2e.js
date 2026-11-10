import { expect, beforeEach } from "@wdio/globals";
import HomePage from "../pageobjects/homepage.page.js";

describe("Maintenance Popin", () => {
  let mock;
  let date;
  let logs;

  function logEvents(event) {
    logs.push({
      text: event.text,
      level: event.level,
    });
  }

  function containsLog(level, text) {
    return logs.some(entry => entry.level === level && entry.text.includes(text));
  }

  before(async function () {
    date = await browser.emulate("clock", { now: new Date("2026-01-01T11:00:00+0100") });

    await browser.sessionSubscribe({ events: ['log.entryAdded'] })
    browser.on('log.entryAdded', logEvents)
  });

  beforeEach(async function () {
    logs = [];
    mock = await browser.mock("https://gristgouv.github.io/next-maintenance/maintenance-preprod.json", {
        method: "get"
    });
  });

  afterEach(async function () {
    browser.mockRestoreAll();
    browser.off()
  });

  after(function () {
    date.restore();
    browser.off('log.entryAdded', logEvents);
  });

  it("should display a maintenance popin when the fetched JSON announce an upcoming one with total interruption", async () => {
    // Given
    mock.respond({
      tz: "CET",
      startDate: "2026-01-02T19:00:00",
      durationMinutes: 30,
      completeInterruption: true
    });

    // When
    await HomePage.open();

    // Then
    await expect(HomePage.maintenancePopin).toBeDisplayed();
    await expect(await HomePage.maintenancePopin).toHaveText(
      expect.stringContaining("Une maintenance de Grist est prévue le vendredi 2 janvier 2026 à 19:00 heure de Paris jusqu'à 19:30"),
        "totalement indisponible",
    );
    await expect(await HomePage.maintenancePopin).toHaveText(
      expect.stringContaining("totalement indisponible")
    );
  });

  it("should display a maintenance popin with instabilities", async () => {
    // Given
    mock.respond({
      tz: "CET",
      startDate: "2026-01-02T19:00:00",
      durationMinutes: 60,
      completeInterruption: false
    });

    // When
    await HomePage.open();

    // Then
    await expect(HomePage.maintenancePopin).toBeDisplayed();
    await expect(await HomePage.maintenancePopin).toHaveText(
      expect.stringContaining("jusqu'à 20:00")
    );
    await expect(await HomePage.maintenancePopin).toHaveText(
      expect.stringContaining("connaître des instabilités")
    );
  });

  it("should not announce maintenance in the past", async () => {
    // Given
    mock.respond({
      tz: "CET",
      startDate: "2026-01-01T00:00:00",
      durationMinutes: 60,
      completeInterruption: false
    });

    // When
    await HomePage.open();

    // Then
    await expect(HomePage.maintenancePopin).not.toBeDisplayed();
  });

  it("should not announce maintenance when the browser takes more than 3 seconds to fetch the JSON", async () => {
    // When
    await HomePage.open();

    // Then
    await browser.waitUntil(async () => containsLog("error", "Maintenance info: fetch aborted after"));
    await expect(HomePage.maintenancePopin).not.toBeDisplayed();
  });

  it("should not announce maintenance when the JSON contains an error", async () => {
    // Given
    mock.respond({
      tz: "CET",
      startDate: "not a date",
      durationMinutes: 60,
      completeInterruption: false
    });

    // When
    await HomePage.open();

    // Then
    await browser.waitUntil(async () => containsLog("error", "Start date is invalid"));
    await expect(HomePage.maintenancePopin).not.toBeDisplayed();
  });
});
