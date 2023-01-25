import { startOfYesterday, subHours } from "date-fns/esm";
import { css, html, LitElement, PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/chart/state-history-charts";
import {
  HistoryResult,
  subscribeHistoryStatesTimeWindow,
  computeHistory,
} from "../../data/history";
import {
  fetchStatistics,
  getStatisticMetadata,
  Statistics,
  StatisticsTypes,
} from "../../data/recorder";
import { HomeAssistant } from "../../types";
import "../../components/chart/statistics-chart";
import { computeDomain } from "../../common/entity/compute_domain";

declare global {
  interface HASSDomEvents {
    closed: undefined;
  }
}

const statTypes: StatisticsTypes = ["state", "min", "mean", "max"];

@customElement("ha-more-info-history")
export class MoreInfoHistory extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public entityId!: string;

  @state() private _stateHistory?: HistoryResult;

  @state() private _statistics?: Statistics;

  private _showMoreHref = "";

  private _statNames?: Record<string, string>;

  private _interval?: number;

  private _subscribed?: Promise<(() => Promise<void>) | void>;

  private _error?: string;

  protected render(): TemplateResult {
    if (!this.entityId) {
      return html``;
    }

    return html` ${isComponentLoaded(this.hass, "history")
      ? html`<div class="header">
            <div class="title">
              ${this.hass.localize("ui.dialogs.more_info_control.history")}
            </div>
            <a href=${this._showMoreHref} @click=${this._close}
              >${this.hass.localize(
                "ui.dialogs.more_info_control.show_more"
              )}</a
            >
          </div>
          ${this._error
            ? html`<div class="errors">${this._error}</div>`
            : this._statistics
            ? html`<statistics-chart
                .hass=${this.hass}
                .isLoadingData=${!this._statistics}
                .statisticsData=${this._statistics}
                .statTypes=${statTypes}
                .names=${this._statNames}
                hideLegend
                .showNames=${false}
              ></statistics-chart>`
            : html`<state-history-charts
                up-to-now
                .hass=${this.hass}
                .historyData=${this._stateHistory}
                .isLoadingData=${!this._stateHistory}
                .showNames=${false}
              ></state-history-charts>`}`
      : ""}`;
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);

    if (changedProps.has("entityId")) {
      this._stateHistory = undefined;
      this._statistics = undefined;

      if (!this.entityId) {
        return;
      }

      this._showMoreHref = `/history?entity_id=${
        this.entityId
      }&start_date=${startOfYesterday().toISOString()}`;

      this._getStateHistory();
    }
  }

  public connectedCallback() {
    super.connectedCallback();
    if (this.hasUpdated && this.entityId) {
      this._getStateHistory();
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeHistoryTimeWindow();
  }

  private _unsubscribeHistoryTimeWindow() {
    if (!this._subscribed) {
      return;
    }
    clearInterval(this._interval);
    this._subscribed.then((unsubscribe) => {
      if (unsubscribe) {
        unsubscribe();
      }
      this._subscribed = undefined;
    });
  }

  private _redrawGraph() {
    if (this._stateHistory) {
      this._stateHistory = { ...this._stateHistory };
    }
  }

  private _setRedrawTimer() {
    // redraw the graph every minute to update the time axis
    clearInterval(this._interval);
    this._interval = window.setInterval(() => this._redrawGraph(), 1000 * 60);
  }

  private async _getStateHistory(): Promise<void> {
    if (
      isComponentLoaded(this.hass, "recorder") &&
      computeDomain(this.entityId) === "sensor"
    ) {
      const metadata = await getStatisticMetadata(this.hass, [this.entityId]);
      this._statNames = { [this.entityId]: "" };
      if (metadata.length) {
        this._statistics = await fetchStatistics(
          this.hass!,
          subHours(new Date(), 24),
          undefined,
          [this.entityId],
          "5minute",
          undefined,
          statTypes
        );
        return;
      }
    }
    if (!isComponentLoaded(this.hass, "history") || this._subscribed) {
      return;
    }
    if (this._subscribed) {
      this._unsubscribeHistoryTimeWindow();
    }
    this._subscribed = subscribeHistoryStatesTimeWindow(
      this.hass!,
      (combinedHistory) => {
        if (!this._subscribed) {
          // Message came in before we had a chance to unload
          return;
        }
        this._stateHistory = computeHistory(
          this.hass!,
          combinedHistory,
          this.hass!.localize
        );
      },
      24,
      [this.entityId]
    ).catch((err) => {
      this._subscribed = undefined;
      this._error = err;
    });
    this._setRedrawTimer();
  }

  private _close(): void {
    setTimeout(() => fireEvent(this, "close-dialog"), 500);
  }

  static styles = css`
    .header {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .header > a,
    a:visited {
      color: var(--primary-color);
    }
    .title {
      font-family: var(--paper-font-title_-_font-family);
      -webkit-font-smoothing: var(--paper-font-title_-_-webkit-font-smoothing);
      font-size: var(--paper-font-subhead_-_font-size);
      font-weight: var(--paper-font-title_-_font-weight);
      letter-spacing: var(--paper-font-title_-_letter-spacing);
      line-height: var(--paper-font-title_-_line-height);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-more-info-history": MoreInfoHistory;
  }
}
