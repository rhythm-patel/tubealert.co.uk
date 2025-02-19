import { Line, ALL_LINES, SEVERITIES } from "./Line";
import { Status } from "./Status";

export default class {
  #appId: string;
  #appKey: string;
  #db: D1Database;

  #UPDATE_TTL = 60 * 1000;

  constructor(appId: string, appKey: string, db: D1Database) {
    this.#appId = appId;
    this.#appKey = appKey;
    this.#db = db;
  }

  async getCurrentStatus(): Promise<Status[]> {
    const { results } = await this.#db.prepare("SELECT * FROM `line`").all();
    return results.map(this.#mapLineStatusFromDb);
  }

  async getDisrupted(): Promise<Status[]> {
    const results = await this.getCurrentStatus();
    return results.filter((status) => status.isDisrupted);
  }

  async updateAndCheckStatus() {
    const updatedAt = await this.#db
      .prepare("SELECT updated_at FROM `line` LIMIT 1")
      .first<string>("updated_at");
    if (updatedAt && Date.parse(updatedAt) > Date.now() - this.#UPDATE_TTL) {
      console.log("Still in cache. Not doing anything");
      return [];
    }
    const newData = await this.#fetchCurrentStatus();
    if (!newData) {
      return [];
    }

    const currentStatuses = await this.getCurrentStatus();

    await this.#saveStatuses(newData);
    return this.#findChangedLines(currentStatuses, newData);
  }

  async #saveStatuses(newStatuses: Status[]) {
    const stmt = this.#db.prepare(
      "UPDATE `line` SET is_disrupted = ?, updated_at = ?, status_summary = ?, status_full = ?, details = ? WHERE id = ?",
    );

    const rows = await this.#db.batch(
      newStatuses.map((status) =>
        stmt.bind(
          status.isDisrupted ? 1 : 0,
          status.updatedAt,
          status.statusSummary,
          status.latestStatus.title,
          JSON.stringify(status.latestStatus.descriptions),
          status.tflKey,
        ),
      ),
    );
  }

  #mapLineStatusFromDb(result: any): Status {
    return {
      name: result.name,
      shortName: result.short_name,
      urlKey: result.url_key,
      tflKey: result.id,
      displayOrder: result.display_order,
      isDisrupted: Boolean(result.is_disrupted),
      updatedAt: result.updated_at,
      statusSummary: result.status_summary,
      latestStatus: {
        updatedAt: result.updated_at,
        isDisrupted: Boolean(result.is_disrupted),
        title: result.status_full,
        shortTitle: result.status_summary,
        descriptions: JSON.parse(result.details ?? "[]"),
      },
    };
  }

  #findChangedLines(oldStatuses: Status[], newStatuses: Status[]) {
    return ALL_LINES.map((lineData) => {
      const oldStatus = oldStatuses?.find(
        (status) => status.tflKey === lineData.tflKey,
      );
      const newStatus = newStatuses?.find(
        (status) => status.tflKey === lineData.tflKey,
      );
      if (
        oldStatus &&
        newStatus &&
        oldStatus.statusSummary !== newStatus.statusSummary
      ) {
        console.log(lineData.tflKey + " has changed");
        return newStatus;
      }

      return null;
    }).filter(Boolean);
  }

  async #fetchCurrentStatus() {
    const url =
      "https://api.tfl.gov.uk/Line/Mode/tube,dlr,elizabeth-line,overground,tram/Status" +
      `?app_id=${this.#appId}` +
      `&app_key=${this.#appKey}`;

    try {
      console.log("Fetching current status from TFL");
      const data = await fetch(url).then((d) => d.json());
      return this.#mutateData(data);
    } catch (e) {
      console.log("Error trying to fetch and parse status: " + e);
    }
  }

  #mutateData(data: any) {
    return ALL_LINES.map((lineData) => {
      const lineStatus = data.find((status) => status.id === lineData.tflKey);
      return this.#makeStatusItem(lineData, lineStatus);
    });
  }

  #makeStatusItem(originalLineData: Line, lineStatus) {
    const now = new Date();
    // create a copy of the lineData object
    const lineData: Partial<Status> = Object.assign({}, originalLineData);

    // set some defaults
    lineData.isDisrupted = false;
    lineData.updatedAt = now.toISOString();
    lineData.statusSummary = "No Information";
    lineData.latestStatus = {
      updatedAt: now.toISOString(),
      isDisrupted: false,
      title: "No Information",
      shortTitle: "No Information",
      descriptions: [],
    };

    if (lineStatus) {
      const sortedStatuses = lineStatus.lineStatuses.sort((a, b) => {
        if (!SEVERITIES[a.statusSeverity] || !SEVERITIES[b.statusSeverity]) {
          return 0;
        }

        return (
          SEVERITIES[a.statusSeverity].displayOrder -
          SEVERITIES[b.statusSeverity].displayOrder
        );
      });

      // get sorted titles and reasons, ensuring unique values
      const titles = sortedStatuses
        .map((s) => s.statusSeverityDescription)
        .filter((value, index, self) => self.indexOf(value) === index);
      const reasons = sortedStatuses
        .map((s) => s.reason || null)
        .filter(
          (value, index, self) =>
            value !== null && self.indexOf(value) === index,
        );

      lineData.latestStatus.isDisrupted = sortedStatuses.reduce(
        (value, status) => {
          if (
            SEVERITIES[status.statusSeverity] &&
            SEVERITIES[status.statusSeverity].disrupted
          ) {
            return true;
          }
          return value;
        },
        false,
      );
      lineData.latestStatus.title = titles.join(", ");
      lineData.latestStatus.shortTitle = titles.slice(0, 2).join(", ");
      lineData.latestStatus.descriptions = reasons;

      lineData.isDisrupted = lineData.latestStatus.isDisrupted;
      lineData.statusSummary = lineData.latestStatus.shortTitle;
    }

    return lineData as Status;
  }
}
