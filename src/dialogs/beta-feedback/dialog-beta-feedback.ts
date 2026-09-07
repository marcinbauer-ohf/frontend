import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import type { HASSDomTargetEvent } from "../../common/dom/fire_event";
import { fireEvent } from "../../common/dom/fire_event";
import { copyToClipboard } from "../../common/util/copy-clipboard";
import "../../components/ha-adaptive-dialog";
import "../../components/ha-alert";
import "../../components/ha-button";
import "../../components/ha-control-select";
import type { ControlSelectOption } from "../../components/ha-control-select";
import "../../components/ha-dialog-footer";
import "../../components/ha-select";
import type { HaSelectSelectEvent } from "../../components/ha-select";
import "../../components/ha-switch";
import type { HaSwitch } from "../../components/ha-switch";
import "../../components/ha-textarea";
import "../../components/input/ha-input";
import "../../components/item/ha-row-item";
import "../../components/list/ha-grouped-list";
import type { AnalyticsSnapshot } from "../../data/analytics";
import { fetchAnalyticsSnapshot } from "../../data/analytics";
import type {
  BetaFeedbackReport,
  BetaFeedbackType,
} from "../../data/beta_feedback";
import {
  BETA_FEEDBACK_PRODUCT_AREAS,
  CONTACT_KEY,
  flushOutbox,
  generateReportId,
  getOutbox,
  isRateLimited,
  submitBetaFeedback,
} from "../../data/beta_feedback";
import type { FeedbackContext } from "../../data/beta_feedback_context";
import {
  collectFeedbackContext,
  CONTEXT_KEYS,
  DEFAULT_UNCHECKED_KEYS,
  downscaleScreenshot,
  isKnownProductArea,
  SCREENSHOT_ACCEPT,
} from "../../data/beta_feedback_context";
import { haStyleDialog } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import { showToast } from "../../util/toast";
import type { BetaFeedbackDialogParams } from "./show-dialog-beta-feedback";
import {
  captureFeedbackOrigin,
  showBetaFeedbackContextDialog,
} from "./show-dialog-beta-feedback";

const MESSAGE_MAX_LENGTH = 2000;

const TYPE_EMOJI: Record<BetaFeedbackType, string> = {
  bug: "🐛",
  reaction: "💬",
};

const BROWSERS: [RegExp, string][] = [
  [/Firefox\/(\d+)/, "Firefox"],
  [/Edg\/(\d+)/, "Edge"],
  [/OPR\/(\d+)/, "Opera"],
  [/Chrome\/(\d+)/, "Chrome"],
  [/Version\/(\d+).*Safari/, "Safari"],
];

const describeBrowser = (userAgent: string): string => {
  for (const [pattern, name] of BROWSERS) {
    const match = userAgent.match(pattern);
    if (match) {
      return `${name} ${match[1]}`;
    }
  }
  return "Unknown browser";
};

@customElement("dialog-beta-feedback")
class DialogBetaFeedback extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _dialogOpen = false;

  @state() private _type: BetaFeedbackType = "bug";

  @state() private _message = "";

  @state() private _productArea?: string;

  @state() private _contact = "";

  @state() private _context?: FeedbackContext;

  @state() private _includeContext = true;

  @state() private _excludedKeys = new Set<keyof FeedbackContext>();

  @state() private _includeAnalytics = false;

  @state() private _consented = false;

  @state() private _screenshotFile?: File;

  @query("#screenshot-input") private _screenshotInput?: HTMLInputElement;

  @state() private _submitting = false;

  @state() private _error?: string;

  @state() private _sentReport?: BetaFeedbackReport;

  @state() private _outboxCount = 0;

  public async showDialog(params: BetaFeedbackDialogParams): Promise<void> {
    // origin is read synchronously so it describes the page as it was, not the
    // page with this dialog on top of it
    const origin = params.origin ?? captureFeedbackOrigin();

    this._type = "bug";
    this._message = "";
    this._productArea = undefined;
    this._context = undefined;
    this._includeContext = true;
    this._excludedKeys = new Set(DEFAULT_UNCHECKED_KEYS);
    this._includeAnalytics = false;
    this._consented = false;
    this._screenshotFile = undefined;
    this._error = undefined;
    this._sentReport = undefined;
    this._submitting = false;
    try {
      this._contact = localStorage.getItem(CONTACT_KEY) || "";
    } catch (_err) {
      this._contact = "";
    }
    this._open = true;
    this._dialogOpen = true;

    this._outboxCount = getOutbox().length;
    if (this._outboxCount) {
      this._outboxCount = await flushOutbox(this.hass);
    }

    const context = await collectFeedbackContext(this.hass, { origin });
    this._context = context;

    if (isKnownProductArea(context.product_area_guess)) {
      this._productArea = context.product_area_guess;
    }
  }

  public closeDialog(): void {
    // let the dialog animate out; _dialogClosed tears the rest down
    this._dialogOpen = false;
  }

  private _dialogClosed(): void {
    this._dialogOpen = false;
    this._open = false;
    this._context = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  // #region render

  protected render() {
    if (!this._open) {
      return nothing;
    }

    return html`
      <ha-adaptive-dialog
        .open=${this._dialogOpen}
        allow-mode-change
        flexcontent
        header-title=${this.hass.localize("ui.dialogs.beta_feedback.title")}
        @closed=${this._dialogClosed}
      >
        <div class="content">
          ${this._sentReport ? this._renderSuccess() : this._renderForm()}
        </div>
        ${
          this._sentReport
            ? html`
                <ha-dialog-footer slot="footer">
                  <ha-button slot="primaryAction" @click=${this.closeDialog}>
                    ${this.hass.localize("ui.common.close")}
                  </ha-button>
                </ha-dialog-footer>
              `
            : html`
                <ha-dialog-footer slot="footer">
                  <ha-button
                    slot="secondaryAction"
                    appearance="plain"
                    @click=${this.closeDialog}
                  >
                    ${this.hass.localize("ui.common.cancel")}
                  </ha-button>
                  <ha-button
                    slot="primaryAction"
                    .disabled=${
                      !this._message.trim() ||
                      !this._consented ||
                      this._submitting
                    }
                    @click=${this._submit}
                  >
                    ${
                      this._submitting
                        ? this.hass.localize("ui.dialogs.beta_feedback.sending")
                        : this.hass.localize("ui.dialogs.beta_feedback.send")
                    }
                  </ha-button>
                </ha-dialog-footer>
              `
        }
      </ha-adaptive-dialog>
    `;
  }

  private _typeOptions(): ControlSelectOption[] {
    return (["bug", "reaction"] as const).map((value) => {
      const label = this.hass.localize(
        `ui.dialogs.beta_feedback.type.${value}`
      );
      return {
        value,
        label: `${TYPE_EMOJI[value]} ${label}`,
        // keep the emoji out of what a screen reader announces
        ariaLabel: label,
      };
    });
  }

  private _renderForm() {
    return html`
      ${
        this._outboxCount
          ? html`<ha-alert alert-type="info">
              ${this.hass.localize("ui.dialogs.beta_feedback.outbox_waiting", {
                count: this._outboxCount,
              })}
            </ha-alert>`
          : nothing
      }
      ${
        this._error
          ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
          : nothing
      }

      <ha-control-select
        .label=${this.hass.localize("ui.dialogs.beta_feedback.type.label")}
        .options=${this._typeOptions()}
        .value=${this._type}
        @value-changed=${this._typeChanged}
      ></ha-control-select>

      <ha-select
        .label=${this.hass.localize(
          "ui.dialogs.beta_feedback.product_area.label"
        )}
        .value=${this._productArea ?? ""}
        required
        .options=${BETA_FEEDBACK_PRODUCT_AREAS.map((area) => ({
          value: area,
          label: area,
        }))}
        @selected=${this._productAreaChanged}
      ></ha-select>

      <ha-textarea
        .label=${this.hass.localize("ui.dialogs.beta_feedback.message.label")}
        .placeholder=${this.hass.localize(
          `ui.dialogs.beta_feedback.message.placeholder.${this._type}`
        )}
        .value=${this._message}
        .maxlength=${MESSAGE_MAX_LENGTH}
        required
        .rows=${4}
        resize="auto"
        @input=${this._messageChanged}
      ></ha-textarea>

      <ha-alert alert-type="info">
        ${this.hass.localize("ui.dialogs.beta_feedback.context.privacy_notice")}
      </ha-alert>

      ${this._renderIncludedGroup()}

      <ha-input
        .label=${this.hass.localize("ui.dialogs.beta_feedback.contact.label")}
        .hint=${this.hass.localize("ui.dialogs.beta_feedback.contact.hint")}
        type="email"
        .value=${this._contact}
        @input=${this._contactChanged}
      ></ha-input>

      <ha-grouped-list>
        <ha-row-item>
          <span slot="headline"
            >${this.hass.localize(
              "ui.dialogs.beta_feedback.consent.label"
            )}<span class="required" aria-hidden="true">*</span></span
          >
          <span slot="supporting-text"
            >${this.hass.localize("ui.dialogs.beta_feedback.consent.hint")}</span
          >
          <ha-switch
            slot="end"
            required
            .checked=${this._consented}
            @change=${this._consentChanged}
          ></ha-switch>
        </ha-row-item>
      </ha-grouped-list>
    `;
  }

  private _contextSummary(): string {
    const context = this._context;
    if (!context) {
      return "";
    }
    return [
      `HA ${context.ha_version}`,
      context.path.label,
      describeBrowser(context.browser.user_agent),
    ]
      .filter(Boolean)
      .join(" · ");
  }

  private _renderIncludedGroup() {
    const summary = this._context
      ? this._contextSummary()
      : this.hass.localize("ui.dialogs.beta_feedback.context.collecting");

    return html`
      <ha-grouped-list
        .header=${this.hass.localize("ui.dialogs.beta_feedback.included.title")}
      >
        <ha-row-item>
          <span slot="headline"
            >${this.hass.localize(
              "ui.dialogs.beta_feedback.context.title"
            )}</span
          >
          <span slot="supporting-text">${summary}</span>
          <ha-button
            slot="end"
            appearance="plain"
            .disabled=${!this._context}
            @click=${this._showContextDetails}
          >
            ${this.hass.localize("ui.dialogs.beta_feedback.context.preview")}
          </ha-button>
          <ha-switch
            slot="end"
            .checked=${this._includeContext}
            @change=${this._includeContextChanged}
          ></ha-switch>
        </ha-row-item>

        <ha-row-item>
          <span slot="headline"
            >${this.hass.localize(
              "ui.dialogs.beta_feedback.analytics.label"
            )}</span
          >
          <span slot="supporting-text"
            >${this.hass.localize(
              "ui.dialogs.beta_feedback.analytics.hint"
            )}</span
          >
          <ha-switch
            slot="end"
            .checked=${this._includeAnalytics}
            @change=${this._analyticsChanged}
          ></ha-switch>
        </ha-row-item>

        ${this._renderScreenshot()}
      </ha-grouped-list>

      <input
        id="screenshot-input"
        type="file"
        accept=${SCREENSHOT_ACCEPT}
        hidden
        @change=${this._screenshotPicked}
      />
    `;
  }

  private _renderScreenshot() {
    const file = this._screenshotFile;

    return html`
      <ha-row-item>
        <span slot="headline"
          >${this.hass.localize(
            "ui.dialogs.beta_feedback.screenshot.title"
          )}</span
        >
        <span slot="supporting-text"
          >${
            file?.name ??
            this.hass.localize("ui.dialogs.beta_feedback.screenshot.none")
          }</span
        >
        ${
          file
            ? html`<ha-button
                slot="end"
                appearance="plain"
                variant="danger"
                @click=${this._screenshotCleared}
              >
                ${this.hass.localize(
                  "ui.dialogs.beta_feedback.screenshot.remove"
                )}
              </ha-button>`
            : html`<ha-button
                slot="end"
                appearance="plain"
                @click=${this._pickScreenshot}
              >
                ${this.hass.localize("ui.dialogs.beta_feedback.screenshot.add")}
              </ha-button>`
        }
      </ha-row-item>
    `;
  }

  private _pickScreenshot(): void {
    this._screenshotInput?.click();
  }

  private _includeContextChanged(ev: HASSDomTargetEvent<HaSwitch>): void {
    this._includeContext = ev.target.checked;
  }

  private _showContextDetails(): void {
    if (!this._context) {
      return;
    }
    showBetaFeedbackContextDialog(this, {
      context: this._context,
      excludedKeys: [...this._excludedKeys],
      onChange: (excludedKeys) => {
        this._excludedKeys = new Set(excludedKeys);
      },
    });
  }

  private async _screenshotPicked(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const screenshot = await downscaleScreenshot(file);
    if (!screenshot) {
      this._error = this.hass.localize(
        "ui.dialogs.beta_feedback.screenshot.failed"
      );
      return;
    }
    this._screenshotFile = file;
    this._context = { ...this._context!, screenshot };
  }

  private _screenshotCleared(): void {
    if (this._screenshotInput) {
      this._screenshotInput.value = "";
    }
    this._screenshotFile = undefined;
    this._context = { ...this._context!, screenshot: undefined };
  }

  private _renderSuccess() {
    const report = this._sentReport!;
    return html`
      <ha-alert alert-type="success">
        ${this.hass.localize("ui.dialogs.beta_feedback.success.title")}
      </ha-alert>
      <p>
        ${this.hass.localize("ui.dialogs.beta_feedback.success.description", {
          report_id: report.report_id,
        })}
      </p>
      <ha-button appearance="outlined" @click=${this._copyAsGithubIssue}>
        ${this.hass.localize("ui.dialogs.beta_feedback.success.copy_github")}
      </ha-button>
    `;
  }

  // #endregion render

  // #region interaction

  private _typeChanged(ev: CustomEvent): void {
    this._type = ev.detail.value as BetaFeedbackType;
  }

  private _messageChanged(ev: Event): void {
    this._message = (ev.target as HTMLTextAreaElement).value;
  }

  private _productAreaChanged(ev: HaSelectSelectEvent): void {
    this._productArea = (ev.detail.value as string) || undefined;
  }

  private _consentChanged(ev: HASSDomTargetEvent<HaSwitch>): void {
    this._consented = ev.target.checked;
  }

  private _contactChanged(ev: Event): void {
    this._contact = (ev.target as HTMLInputElement).value;
  }

  private _analyticsChanged(ev: HASSDomTargetEvent<HaSwitch>): void {
    this._includeAnalytics = ev.target.checked;
  }

  private _buildContext(): Partial<FeedbackContext> {
    const context = this._context;
    if (!context) {
      return {};
    }
    const included: Partial<FeedbackContext> = {};
    for (const key of CONTEXT_KEYS) {
      if (this._excludedKeys.has(key) || context[key] === undefined) {
        continue;
      }

      (included as any)[key] = context[key];
    }
    return included;
  }

  private async _submit(): Promise<void> {
    if (!this._message.trim()) {
      return;
    }
    if (isRateLimited()) {
      this._error = this.hass.localize("ui.dialogs.beta_feedback.rate_limited");
      return;
    }

    this._submitting = true;
    this._error = undefined;

    let analyticsSnapshot: AnalyticsSnapshot | undefined;
    if (this._includeAnalytics) {
      try {
        analyticsSnapshot = await fetchAnalyticsSnapshot(this.hass);
      } catch (_err) {
        // core without the analytics/snapshot command — send without it
        showToast(this, {
          message: this.hass.localize(
            "ui.dialogs.beta_feedback.analytics.unavailable"
          ),
        });
      }
    }

    const report: BetaFeedbackReport = {
      report_id: generateReportId(),
      created_at: new Date().toISOString(),
      type: this._type,
      product_area: this._productArea!,
      message: this._message.trim(),
      contact: this._contact.trim() || undefined,
      context: this._buildContext(),
      analytics_snapshot: analyticsSnapshot as
        Record<string, unknown> | undefined,
      schema_version: 1,
    };

    try {
      localStorage.setItem(CONTACT_KEY, this._contact.trim());
    } catch (_err) {
      // storage unavailable, prefill just won't work next time
    }

    try {
      await submitBetaFeedback(this.hass, report);
      this._sentReport = report;
    } catch (err) {
      this._error = this.hass.localize("ui.dialogs.beta_feedback.send_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      this._outboxCount = getOutbox().length;
    } finally {
      this._submitting = false;
    }
  }

  private async _copyAsGithubIssue(): Promise<void> {
    const report = this._sentReport!;
    const context = report.context;

    const rows = Object.entries(context)
      .map(
        ([key, value]) =>
          `| ${key} | ${typeof value === "string" ? value : "```" + JSON.stringify(value) + "```"} |`
      )
      .join("\n");

    const title = `[${report.type}] ${report.product_area || context.path?.label || "Feedback"}`;
    const body = [
      `**Report ID:** ${report.report_id}`,
      "",
      report.message,
      "",
      "| Context | Value |",
      "| --- | --- |",
      rows,
    ].join("\n");

    await copyToClipboard(`# ${title}\n\n${body}`);
    showToast(this, {
      message: this.hass.localize("ui.dialogs.beta_feedback.success.copied"),
    });

    // an integration points at core, anything else at the frontend
    const repo = context.integration ? "core" : "frontend";
    window.open(
      `https://github.com/home-assistant/${repo}/issues/new`,
      "_blank",
      "noreferrer"
    );
  }

  // #endregion interaction

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        ha-adaptive-dialog {
          --ha-dialog-width-md: 560px;
        }
        .content {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
        }
        input[type="file"] {
          display: none;
        }
        ha-row-item ha-button[slot="end"] {
          margin-inline-end: var(--ha-space-2);
        }
        .required {
          margin-inline-start: 2px;
          color: var(--error-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-beta-feedback": DialogBetaFeedback;
  }
}
