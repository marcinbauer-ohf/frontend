import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiCodeBraces,
  mdiDotsVertical,
  mdiDownload,
  mdiFileDocumentOutline,
  mdiFileImportOutline,
  mdiFormatListText,
  mdiHistory,
  mdiInformationOutline,
  mdiRefresh,
  mdiTimelineClockOutline,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { ifDefined } from "lit/directives/if-defined";
import { styleMap } from "lit/directives/style-map";
import { consume } from "../../../common/decorators/consume";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { fireEvent } from "../../../common/dom/fire_event";
import { navigate, replaceCurrentUrl } from "../../../common/navigate";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-floating-bar";
import "../../../components/ha-icon-button";
import "../../../components/trace/ha-trace-blueprint-config";
import "../../../components/trace/ha-trace-config";
import "../../../components/trace/ha-trace-logbook";
import { describeTraceNode } from "../../../components/trace/ha-trace-path-details";
import "../../../components/trace/ha-trace-timeline";
import "../../../components/trace/hat-script-graph";
import type {
  HatScriptGraph,
  NodeInfo,
} from "../../../components/trace/hat-script-graph";
import type { AutomationEntity } from "../../../data/automation";
import {
  fireRelatedContext,
  fullEntitiesContext,
  manifestsContext,
} from "../../../data/context";
import type { DomainManifestLookup } from "../../../data/integration";
import { buildTraceLabels } from "../../../data/trace-labels";
import type { EntityRegistryEntry } from "../../../data/entity/entity_registry";
import type { LogbookEntry } from "../../../data/logbook";
import { getLogbookDataForContext } from "../../../data/logbook";
import type {
  AutomationTrace,
  AutomationTraceExtended,
} from "../../../data/trace";
import { getTracePath, loadTrace, loadTraces } from "../../../data/trace";
import { TraceRunController } from "../../../data/trace-run-controller";
import { showAlertDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, Route } from "../../../types";
import { fileDownload } from "../../../util/file_download";
import "../../../components/ha-trace-picker";
import "../../../components/ha-side-pane";
import "../../../components/skeleton/ha-skeleton";
import "../../../components/skeleton/ha-skeleton-text";
import { storage } from "../../../common/decorators/storage";
import { SIDEBAR_DEFAULT_WIDTH } from "./ha-manual-editor-mixin";
import { CONTENT_MIN_WIDTH, SIDEBAR_MIN_WIDTH } from "./styles";

type PaneView =
  "timeline" | "details" | "logbook" | "automation_config" | "blueprint";

@customElement("ha-automation-trace")
export class HaAutomationTrace extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public automationId!: string;

  @property({ attribute: false }) public automations!: AutomationEntity[];

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state()
  @consume({ context: manifestsContext, subscribe: true })
  _manifests?: DomainManifestLookup;

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  _entityRegistry?: EntityRegistryEntry[];

  @state() private _entityId?: string;

  @state() private _traces?: AutomationTrace[];

  @state() private _runId?: string;

  @state() private _selected?: NodeInfo;

  @state() private _trace?: AutomationTraceExtended;

  @state() private _logbookEntries?: LogbookEntry[];

  @state() private _view: PaneView = "timeline";

  @state() private _paneOpen = true;

  // Shared with the automation editor's sidebars
  @storage({
    key: "automation-sidebar-width",
    state: true,
    subscribe: true,
  })
  private _paneWidth = SIDEBAR_DEFAULT_WIDTH;

  @query("ha-side-pane") private _pane?: HTMLElement;

  private _paneStartWidth?: number;

  @query("hat-script-graph") private _graph?: HatScriptGraph;

  private _runNavigation = new TraceRunController(this, {
    tracePath: () => getTracePath("automation", this.automationId),
    shownRunId: () => this._runId,
    loadRun: (runId) => {
      this._selected = undefined;
      this._loadTraces(runId);
    },
  });

  /**
   * `hass` is replaced on every state update, so comparing it would rebuild
   * every label on every state event. The run already happened, so only the
   * trace and the registries the descriptions read can change the result.
   */
  private _traceLabels = memoizeOne(
    buildTraceLabels,
    ([trace, , entities, manifests], [pTrace, , pEntities, pManifests]) =>
      trace === pTrace && entities === pEntities && manifests === pManifests
  );

  protected render(): TemplateResult {
    const stateObj = this._entityId
      ? this.hass.states[this._entityId]
      : undefined;

    const title = stateObj?.attributes.friendly_name || this._entityId;

    const traces = this._traces?.length ? this._traces : undefined;
    // In the picker's row of buttons when there are runs, so the run bars
    // get the bar's full width
    const menu = html`<ha-dropdown
      slot=${ifDefined(traces ? "end" : undefined)}
      placement="top-end"
      @wa-select=${this._handleDropdownSelect}
    >
      <ha-icon-button
        slot="trigger"
        .label=${this.hass.localize("ui.common.menu")}
        .path=${mdiDotsVertical}
      ></ha-icon-button>
      <ha-dropdown-item .disabled=${!stateObj} value="show_info">
        ${this.hass.localize("ui.panel.config.automation.editor.show_info")}
        <ha-svg-icon slot="icon" .path=${mdiInformationOutline}></ha-svg-icon>
      </ha-dropdown-item>
      <wa-divider></wa-divider>
      <ha-dropdown-item value="refresh">
        ${this.hass.localize("ui.panel.config.automation.trace.refresh")}
        <ha-svg-icon slot="icon" .path=${mdiRefresh}></ha-svg-icon>
      </ha-dropdown-item>
      <ha-dropdown-item .disabled=${!this._trace} value="download_trace">
        ${this.hass.localize("ui.panel.config.automation.trace.download_trace")}
        <ha-svg-icon slot="icon" .path=${mdiDownload}></ha-svg-icon>
      </ha-dropdown-item>
      ${
        __DEV__
          ? html`<wa-divider></wa-divider>
              <ha-dropdown-item value="import_trace">
                ${this.hass.localize(
                  "ui.panel.config.automation.trace.import_trace"
                )}
                <ha-svg-icon
                  slot="icon"
                  .path=${mdiFileImportOutline}
                ></ha-svg-icon>
              </ha-dropdown-item>
              <ha-dropdown-item value="load_stored_trace">
                ${this.hass.localize(
                  "ui.panel.config.automation.trace.load_stored_trace"
                )}
                <ha-svg-icon slot="icon" .path=${mdiHistory}></ha-svg-icon>
              </ha-dropdown-item>`
          : nothing
      }
    </ha-dropdown>`;

    return html`
      <hass-subpage
        style=${styleMap({
          // As wide as the automation editor's sidebar, up to half the
          // page, so the graph keeps the other half
          "--ha-side-pane-width": `min(max(${this._paneWidth}px, ${SIDEBAR_MIN_WIDTH}px), 100vw - ${CONTENT_MIN_WIDTH}px - var(--ha-sidebar-width, 0px), (100vw - var(--ha-sidebar-width, 0px)) / 2)`,
        })}
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/automation/dashboard"
        .header=${title}
        .scrollable=${this.narrow}
      >
        ${
          this._trace
            ? html`<ha-icon-button
                slot="toolbar-icon"
                .label=${this.hass.localize(
                  "ui.panel.config.automation.trace.tabs.timeline"
                )}
                .path=${mdiTimelineClockOutline}
                aria-pressed=${this._paneOpen}
                @click=${this._togglePane}
              ></ha-icon-button>`
            : nothing
        }
        <ha-floating-bar slot="floating-bar">
          ${
            stateObj?.attributes.id
              ? html`<ha-button-toggle-group
                  class="mode-switch"
                  full-width
                  size="s"
                  variant="neutral"
                  .buttons=${[
                    {
                      value: "edit",
                      label: this.hass.localize("ui.common.edit"),
                    },
                    {
                      value: "traces",
                      label: this.hass.localize(
                        "ui.panel.config.automation.editor.show_trace"
                      ),
                    },
                  ]}
                  active="traces"
                  @value-changed=${this._editTracesChanged}
                ></ha-button-toggle-group>`
              : nothing
          }
          <div class="bar-row">
            ${
              traces
                ? html`<ha-trace-picker
                    period
                    .narrow=${this.narrow}
                    .traces=${traces}
                    .value=${this._runId}
                    @value-changed=${this._pickTrace}
                    >${menu}</ha-trace-picker
                  >`
                : html`<div class="spacer"></div>
                    ${menu}`
            }
          </div>
        </ha-floating-bar>

        ${
          this._traces === undefined
            ? html`<div class="container">
                ${this.hass!.localize("ui.common.loading")}
              </div>`
            : this._traces.length === 0
              ? html`<div class="container">
                  ${this.hass!.localize(
                    "ui.panel.config.automation.trace.no_traces_found"
                  )}
                </div>`
              : html`<div class="main">
                    ${this._trace ? this._renderGraph() : this._renderGraphSkeleton()}
                  </div>
                  ${this._paneOpen ? this._renderPane() : nothing}`
        }
      </hass-subpage>
    `;
  }

  private _renderGraph(): TemplateResult {
    return html`<div class="graph">
      <hat-script-graph
        .trace=${this._trace}
        .selected=${this._selected?.path}
        .labels=${
          this._trace
            ? this._traceLabels(
                this._trace,
                this.hass,
                this._entityRegistry,
                this._manifests
              )
            : undefined
        }
        @graph-node-selected=${this._pickNode}
      ></hat-script-graph>
    </div>`;
  }

  // Placeholders while a run loads, in the shape of what replaces them, so
  // switching runs does not empty and refill the page
  private _renderGraphSkeleton(): TemplateResult {
    return html`<div class="graph graph-skeleton" aria-busy="true">
      ${[0, 1, 2, 3].map(
        () =>
          html`<ha-skeleton class="node-skeleton" effect="sheen"></ha-skeleton>`
      )}
    </div>`;
  }

  private _renderTimelineSkeleton(): TemplateResult {
    return html`<div class="timeline-skeleton" aria-busy="true">
      ${[0, 1, 2, 3, 4].map(
        () =>
          html`<div class="row-skeleton">
            <ha-skeleton-text
              class="time-skeleton"
              effect="sheen"
            ></ha-skeleton-text>
            <ha-skeleton class="dot-skeleton" effect="sheen"></ha-skeleton>
            <ha-skeleton-text effect="sheen"></ha-skeleton-text>
          </div>`
      )}
    </div>`;
  }

  // The run's timeline, or what was picked from it: a step's details, the
  // related activity or the configuration the run used
  private _renderPane(): TemplateResult {
    const localize = this.hass.localize;
    const graph = this._graph;
    const trackedNodes = graph?.trackedNodes;
    const renderedNodes = graph?.renderedNodes;
    const view = this._view;
    const viewName = localize(
      `ui.panel.config.automation.trace.tabs.${
        view === "blueprint" ? "blueprint_config" : view
      }`
    );
    // A step's details carry the step's name, with the view under it
    const stepName =
      view === "details" && this._selected && this._entityRegistry
        ? describeTraceNode(
            this.hass,
            this._entityRegistry,
            this._manifests,
            this._selected
          )
        : undefined;
    const ready =
      this._selected !== undefined &&
      this._logbookEntries !== undefined &&
      trackedNodes !== undefined;
    return html`<ha-side-pane
      slot="side-pane"
      .narrow=${this.narrow}
      .heading=${stepName ?? viewName}
      .subtitle=${stepName ? viewName : undefined}
      .back=${view !== "timeline"}
      resizable
      @side-pane-closed=${this._closePane}
      @side-pane-back=${this._showTimeline}
      @sidebar-resized=${this._paneResized}
      @sidebar-resizing-stopped=${this._paneResizeStopped}
      @sidebar-reset-size=${this._paneResetSize}
    >
      <ha-dropdown
        slot="actions"
        placement="bottom-end"
        @wa-select=${this._handleViewSelect}
      >
        <ha-icon-button
          slot="trigger"
          .label=${localize("ui.common.menu")}
          .path=${mdiDotsVertical}
        ></ha-icon-button>
        <ha-dropdown-item value="logbook">
          ${localize("ui.panel.config.automation.trace.tabs.logbook")}
          <ha-svg-icon slot="icon" .path=${mdiFormatListText}></ha-svg-icon>
        </ha-dropdown-item>
        <ha-dropdown-item value="automation_config">
          ${localize("ui.panel.config.automation.trace.tabs.automation_config")}
          <ha-svg-icon slot="icon" .path=${mdiCodeBraces}></ha-svg-icon>
        </ha-dropdown-item>
        ${
          this._trace?.blueprint_inputs
            ? html`<ha-dropdown-item value="blueprint">
                ${localize(
                  "ui.panel.config.automation.trace.tabs.blueprint_config"
                )}
                <ha-svg-icon
                  slot="icon"
                  .path=${mdiFileDocumentOutline}
                ></ha-svg-icon>
              </ha-dropdown-item>`
            : nothing
        }
      </ha-dropdown>
      ${
        !ready
          ? this._renderTimelineSkeleton()
          : view === "details"
            ? html`<ha-trace-path-details
                hide-name
                .hass=${this.hass}
                .narrow=${this.narrow}
                .trace=${this._trace!}
                .selected=${this._selected!}
                .logbookEntries=${this._logbookEntries!}
                .trackedNodes=${trackedNodes}
                .renderedNodes=${renderedNodes!}
              ></ha-trace-path-details>`
            : view === "automation_config"
              ? html`<ha-trace-config .trace=${this._trace!}></ha-trace-config>`
              : view === "logbook"
                ? html`<ha-trace-logbook
                    .hass=${this.hass}
                    .narrow=${this.narrow}
                    .trace=${this._trace!}
                    .logbookEntries=${this._logbookEntries!}
                  ></ha-trace-logbook>`
                : view === "blueprint"
                  ? html`<ha-trace-blueprint-config
                      .trace=${this._trace!}
                    ></ha-trace-blueprint-config>`
                  : html`<ha-trace-timeline
                      .hass=${this.hass}
                      .narrow=${this.narrow}
                      .trace=${this._trace!}
                      .logbookEntries=${this._logbookEntries!}
                      .selected=${this._selected!}
                      @value-changed=${this._timelinePathPicked}
                    ></ha-trace-timeline>`
      }
    </ha-side-pane>`;
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);

    this.hass.loadBackendTranslation("triggers");
    this.hass.loadBackendTranslation("conditions");

    // On a phone the pane is a sheet over the graph; it opens for a step
    this._paneOpen = !this.narrow;

    if (!this.automationId) {
      return;
    }

    const params = new URLSearchParams(location.search);
    this._loadTraces(params.get("run_id") || undefined);
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);

    // Only reset if automationId has changed and we had one before.
    if (changedProps.get("automationId")) {
      this._traces = undefined;
      this._entityId = undefined;
      this._runId = undefined;
      this._selected = undefined;
      this._trace = undefined;
      this._logbookEntries = undefined;
      if (this.automationId) {
        // A link from another trace reuses this page and names the run.
        const params = new URLSearchParams(location.search);
        this._loadTraces(params.get("run_id") || undefined);
      }
    }

    if (changedProps.has("_runId") && this._runId) {
      this._trace = undefined;
      this._logbookEntries = undefined;
      this._loadTrace();
      this._runNavigation.writeRunIdToUrl(this._runId);
    }

    if (
      (changedProps.has("automationId") || changedProps.has("automations")) &&
      this.automationId &&
      !this._entityId
    ) {
      const automation = this.automations.find(
        (entity: AutomationEntity) => entity.attributes.id === this.automationId
      );
      this._entityId = automation?.entity_id;
    }

    if (
      changedProps.has("automationId") ||
      changedProps.has("_entityId") ||
      changedProps.has("_entityRegistry")
    ) {
      this._setRelatedContext();
    }
  }

  private _setRelatedContext() {
    const areaId = this._entityId
      ? this._entityRegistry?.find(
          (entry) => entry.entity_id === this._entityId
        )?.area_id
      : undefined;
    fireRelatedContext(
      this,
      areaId
        ? {
            itemType: "area",
            itemId: areaId,
          }
        : undefined
    );
  }

  private _pickTrace(ev) {
    this._pickRun(ev.detail.value);
  }

  private _pickRun(runId: string) {
    this._runNavigation.cancelLinkRequest();
    this._runId = runId;
    this._selected = undefined;
    this._view = "timeline";
  }

  // The graph selects its first step by itself when a run loads; only a
  // step picked after that opens its details
  private _pickNode(ev) {
    const picked = this._selected !== undefined;
    this._selected = ev.detail;
    if (picked) {
      this._showView("details");
    }
  }

  private _showView(view: PaneView) {
    this._view = view;
    this._paneOpen = true;
  }

  private _showTimeline() {
    this._view = "timeline";
  }

  private _togglePane() {
    this._paneOpen = !this._paneOpen;
  }

  private _closePane() {
    this._paneOpen = false;
  }

  private _handleViewSelect(ev: HaDropdownSelectEvent) {
    const view = ev.detail?.item?.value as PaneView | undefined;
    if (view) {
      this._showView(view);
    }
  }

  private _paneResized(ev: CustomEvent<{ deltaInPx: number }>) {
    ev.stopPropagation();
    this._paneStartWidth ??= this._pane?.clientWidth ?? SIDEBAR_DEFAULT_WIDTH;
    this._paneWidth = this._paneStartWidth + ev.detail.deltaInPx;
  }

  private _paneResizeStopped(ev: Event) {
    ev.stopPropagation();
    this._paneStartWidth = undefined;
  }

  private _paneResetSize(ev: Event) {
    ev.stopPropagation();
    this._paneStartWidth = undefined;
    this._paneWidth = SIDEBAR_DEFAULT_WIDTH;
  }

  private _refreshTraces() {
    // Keep the run of a link that is still loading.
    this._loadTraces(this._runNavigation.requestedRunId);
  }

  private async _loadTraces(runId?: string) {
    const request = this._runNavigation.startListRequest(runId);
    const traces = await loadTraces(this.hass, "automation", this.automationId);
    if (!this._runNavigation.isLatestListRequest(request)) {
      return;
    }
    this._runNavigation.endListRequest();
    this._traces = traces;
    // Newest will be on top.
    this._traces.reverse();

    if (runId) {
      this._runId = runId;
    }

    // Check if current run ID still exists
    if (
      this._runId &&
      !this._traces.some((trace) => trace.run_id === this._runId)
    ) {
      this._runId = undefined;
      this._selected = undefined;

      // If we came here from a trace passed into the url, clear it.
      if (runId) {
        const params = new URLSearchParams(location.search);
        params.delete("run_id");
        replaceCurrentUrl(`${location.pathname}?${params.toString()}`);
      }

      await showAlertDialog(this, {
        text: this.hass!.localize(
          "ui.panel.config.automation.trace.trace_no_longer_available"
        ),
      });
      if (!this._runNavigation.isLatestListRequest(request)) {
        return;
      }
    }

    // See if we can set a default runID
    if (!this._runId && this._traces.length > 0) {
      this._runId = this._traces[0].run_id;
    }
  }

  private async _loadTrace() {
    const request = this._runNavigation.startTraceRequest();
    const runId = this._runId!;
    const trace = await loadTrace(
      this.hass,
      "automation",
      this.automationId,
      runId
    );
    const logbookEntries = isComponentLoaded(this.hass.config, "logbook")
      ? await getLogbookDataForContext(
          this.hass,
          trace.timestamp.start,
          trace.context.id
        )
      : [];

    // Another run was picked, or the same run loaded again, meanwhile.
    if (
      !this._runNavigation.isLatestTraceRequest(request) ||
      runId !== this._runId
    ) {
      return;
    }
    this._logbookEntries = logbookEntries;
    this._trace = trace;
  }

  private _downloadTrace() {
    const json = JSON.stringify(
      {
        trace: this._trace,
        logbookEntries: this._logbookEntries,
      },
      undefined,
      2
    );
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    fileDownload(
      url,
      `trace ${this._entityId} ${this._trace!.timestamp.start}.json`
    );
  }

  private _importTrace() {
    const traceText = prompt(
      this.hass.localize(
        "ui.panel.config.automation.trace.enter_downloaded_trace"
      )
    );
    if (!traceText) {
      return;
    }
    window.localStorage.setItem("devTrace", traceText);
    this._loadLocalTrace(traceText);
  }

  private _loadLocalStorageTrace() {
    const devTrace = window.localStorage.getItem("devTrace");
    if (devTrace) {
      this._loadLocalTrace(devTrace);
    }
  }

  private _loadLocalTrace(traceText: string) {
    const traceInfo = JSON.parse(traceText);
    this._trace = traceInfo.trace;
    this._logbookEntries = traceInfo.logbookEntries;
  }

  private _timelinePathPicked(ev: CustomEvent) {
    const path = ev.detail.value;
    const nodes = this._graph!.trackedNodes;
    if (nodes[path]) {
      this._selected = nodes[path];
      this._showView("details");
    }
  }

  private _showInfo() {
    if (!this.hass || !this._entityId) {
      return;
    }
    fireEvent(this, "hass-more-info", { entityId: this._entityId });
  }

  private _editTracesChanged(ev: CustomEvent<{ value: string }>) {
    if (ev.detail.value === "edit") {
      this._navigateToAutomation();
    }
  }

  private _navigateToAutomation() {
    if (this._entityId && this.hass.states[this._entityId]) {
      navigate(
        `/config/automation/edit/${encodeURIComponent(this.hass.states[this._entityId].attributes.id)}`
      );
    }
  }

  private _handleDropdownSelect(ev: HaDropdownSelectEvent) {
    const action = ev.detail?.item?.value;

    if (!action) {
      return;
    }

    switch (action) {
      case "show_info":
        this._showInfo();
        break;
      case "refresh":
        this._refreshTraces();
        break;
      case "download_trace":
        this._downloadTrace();
        break;
      case "import_trace":
        this._importTrace();
        break;
      case "load_stored_trace":
        this._loadLocalStorageTrace();
        break;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          /* Room to scroll the panes out from under the floating bar. */
          --trace-bar-room: 220px;
        }

        /* The Edit and Traces choice stands apart from the controls below. */
        .mode-switch {
          margin-bottom: var(--ha-space-2);
        }

        .bar-row {
          display: flex;
          align-items: center;
          gap: var(--ha-space-1);
        }

        .bar-row > * {
          flex-shrink: 0;
        }

        .bar-row ha-icon-button {
          flex-shrink: 0;
          --ha-icon-button-size: 40px;
          --mdc-icon-size: 24px;
          color: var(--secondary-text-color);
        }

        :host([narrow]) .bar-row ha-icon-button {
          --ha-icon-button-size: 36px;
        }

        .bar-row ha-button-toggle-group {
          margin-inline-end: var(--ha-space-1);
        }

        .bar-row ha-trace-picker,
        .bar-row .spacer {
          flex: 1;
          flex-shrink: 1;
          min-width: 0;
        }

        .main {
          flex: 1;
          min-height: 0;
          display: flex;
          overflow: hidden;
          background-color: var(--primary-background-color);
          direction: ltr;
        }

        :host([narrow]) .main {
          padding-bottom: var(--trace-bar-room);
          flex: none;
          height: auto;
          overflow: visible;
        }

        .container {
          padding: 16px;
          text-align: center;
        }

        .graph {
          flex: 1;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 0;
          min-height: 0;
          padding-bottom: var(--trace-bar-room);
        }
        hat-script-graph {
          flex: 1;
          min-width: 0;
          min-height: 0;
        }
        :host([narrow]) .graph {
          max-width: 100%;
          overflow: visible;
          height: auto;
          padding-bottom: 0;
        }
        :host([narrow]) hat-script-graph {
          overflow: visible;
          flex: none;
        }
        ha-trace-logbook {
          direction: var(--direction);
        }

        .graph-skeleton {
          align-items: center;
          justify-content: center;
          gap: var(--ha-space-8);
        }
        .node-skeleton {
          width: 40px;
          height: 40px;
          --ha-skeleton-border-radius: var(--ha-border-radius-circle);
        }

        /* Rows laid out like the timeline: time, dot, text */
        .timeline-skeleton {
          padding: var(--ha-space-4);
        }
        .row-skeleton {
          display: grid;
          grid-template-columns: 72px 36px minmax(0, 1fr);
          column-gap: var(--ha-space-3);
          align-items: center;
          min-height: 72px;
          border-bottom: 1px solid var(--divider-color);
        }
        .row-skeleton:last-child {
          border-bottom: none;
        }
        .time-skeleton {
          --ha-skeleton-text-width: 56px;
        }
        .dot-skeleton {
          justify-self: center;
          width: 10px;
          height: 10px;
          --ha-skeleton-border-radius: var(--ha-border-radius-circle);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-trace": HaAutomationTrace;
  }
}
