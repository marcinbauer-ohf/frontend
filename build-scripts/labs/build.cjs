#!/usr/bin/env node
// One-off build driver producing self-contained, single-file IIFE bundles
// for the new standalone HA Labs "card" components introduced by the
// bottom-navigation/search-pill feature branch:
//   - ha-bottom-navigation
//   - ha-bottom-navigation-assist
//   - ha-search-pill
//   - ha-quick-bar-content
//
// Not part of the app's own webpack/rspack graph (build-scripts/rspack.cjs):
// these are injected into an already-running HA page via
// `add_extra_js_url`, so each bundle must carry its own copy of `lit` etc.
//
// Key constraint this script works around: every one of these new
// components imports several ALREADY-EXISTING `ha-*` custom elements
// (ha-icon, ha-svg-icon, ha-list-item-button, ha-assist-chat, ...) purely
// for their registration side effect. The real running HA frontend has
// already registered all of those tags. If we bundled fresh copies too,
// `customElements.define` would throw on the second registration attempt -
// and since that happens at module-evaluation time (before our own target
// element's `@customElement(...)` runs), it could abort the whole script,
// including sibling built-in dialogs it might reach if it happens during
// their lazy chunk load. So: every already-registered `ha-*` (or web-awesome)
// dependency is redirected to an empty module here - the tag still works at
// runtime because Lit resolves custom elements by tag name against the
// global registry, not via the JS class import. See CLAUDE.md/report for
// the two further approximations this required (vendoring computePanels,
// and shimming showQuickBar/showVoiceCommandDialog for ha-search-pill).
const fs = require("fs");
const path = require("path");
const rspack = require("@rspack/core");
// eslint-disable-next-line @typescript-eslint/naming-convention
const TerserPlugin = require("terser-webpack-plugin");
const paths = require("../paths.cjs");
const bundle = require("../bundle.cjs");

const LABS_SRC_DIR = __dirname;
const OUTPUT_ROOT = path.resolve(paths.root_dir, "build/labs");

const abs = (relToRoot) => path.resolve(paths.root_dir, relToRoot);

// Already-registered-by-the-real-app dependencies: redirect the exact
// import specifier (as literally written in the importing file) to an
// empty module. Verified empirically against rspack 2.1.4:
// `resolve.alias` with a `$`-suffixed relative-path key does NOT intercept
// relative specifiers here (only bare/package-style keys reliably do), but
// `NormalModuleReplacementPlugin` with a regex anchored against the literal
// specifier text (`data.request`, e.g. "../../components/ha-icon") does -
// for both its `beforeResolve` and `afterResolve` hook firings. So
// externalization below uses that mechanism instead of resolve.alias.
const EMPTY_MODULE = abs("src/util/empty.js");

// Full lit / @lit-labs / @formatjs subpath alias set, copied from
// build-scripts/rspack.cjs (the app's own config) - several of these
// packages' package.json `exports` maps don't expose the subpaths some
// components import directly, so rspack's default resolution needs the
// same explicit help here that the main app build already gives it.
const LIT_SUBPATH_ALIASES = {
  "lit/static-html$": "lit/static-html.js",
  "lit/decorators$": "lit/decorators.js",
  "lit/directive$": "lit/directive.js",
  "lit/directives/until$": "lit/directives/until.js",
  "lit/directives/ref$": "lit/directives/ref.js",
  "lit/directives/class-map$": "lit/directives/class-map.js",
  "lit/directives/style-map$": "lit/directives/style-map.js",
  "lit/directives/if-defined$": "lit/directives/if-defined.js",
  "lit/directives/guard$": "lit/directives/guard.js",
  "lit/directives/cache$": "lit/directives/cache.js",
  "lit/directives/join$": "lit/directives/join.js",
  "lit/directives/repeat$": "lit/directives/repeat.js",
  "lit/directives/live$": "lit/directives/live.js",
  "lit/directives/keyed$": "lit/directives/keyed.js",
  "lit/polyfill-support$": "lit/polyfill-support.js",
  "@lit-labs/virtualizer/layouts/grid": "@lit-labs/virtualizer/layouts/grid.js",
  "@lit-labs/virtualizer/polyfills/resize-observer-polyfill/ResizeObserver":
    "@lit-labs/virtualizer/polyfills/resize-observer-polyfill/ResizeObserver.js",
  "@lit-labs/observers/resize-controller":
    "@lit-labs/observers/resize-controller.js",
};

const VENDORED_COMPUTE_PANELS = path.resolve(
  LABS_SRC_DIR,
  "vendor-compute-panels.ts"
);
const SHIM_SHOW_QUICK_BAR = path.resolve(
  LABS_SRC_DIR,
  "shim-show-quick-bar.ts"
);
const SHIM_SHOW_VOICE_COMMAND_DIALOG = path.resolve(
  LABS_SRC_DIR,
  "shim-show-voice-command-dialog.ts"
);
const VENDORED_EFFECTIVE_QUICK_BAR_MODE = path.resolve(
  LABS_SRC_DIR,
  "vendor-effective-quick-bar-mode.ts"
);

/**
 * @param {object} opts
 * @param {string} opts.id - output subdirectory / bundle name
 * @param {string} opts.entryFile - absolute path to the component's .ts file
 * @param {Record<string,string>} [opts.externalize] - exact import specifier
 *   (as literally written in the source) -> absolute path replacement
 *   resource, applied via NormalModuleReplacementPlugin.
 */
function buildEntryConfig({
  id,
  entryFile,
  externalize = {},
  publicPath = "",
}) {
  const replacementPlugins = Object.entries(externalize).map(
    ([specifier, target]) => {
      const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new rspack.NormalModuleReplacementPlugin(
        new RegExp(`^${escaped}$`),
        target
      );
    }
  );

  return {
    name: id,
    mode: "production",
    target: "browserslist:modern",
    devtool: false,
    entry: { [id]: entryFile },
    node: false,
    module: {
      rules: [
        {
          test: /\.m?js$|\.ts$/,
          exclude: /node_modules[\\/]core-js/,
          use: [
            {
              loader: "builtin:swc-loader",
              options: bundle.swcOptions(),
            },
          ],
          resolve: { fullySpecified: false },
        },
      ],
    },
    optimization: {
      minimizer: [
        new TerserPlugin({
          parallel: true,
          terserOptions: bundle.terserOptions({
            latestBuild: true,
            isTestBuild: false,
          }),
        }),
      ],
      splitChunks: false,
      runtimeChunk: false,
    },
    plugins: [
      new rspack.DefinePlugin(
        bundle.definedVars({
          isProdBuild: true,
          latestBuild: true,
          defineOverlay: {},
        })
      ),
      ...replacementPlugins,
    ],
    resolve: {
      extensions: [".ts", ".js", ".json"],
      alias: {
        ...LIT_SUBPATH_ALIASES,
      },
    },
    output: {
      filename: "[name].js",
      chunkFilename: "[name].[contenthash].chunk.js",
      path: path.resolve(OUTPUT_ROOT, id),
      publicPath,
      hashFunction: "xxhash64",
      iife: true,
      globalObject: "self",
    },
    experiments: {
      outputModule: false,
    },
  };
}

const WEBAWESOME_DIVIDER = path.resolve(
  paths.root_dir,
  "node_modules/@home-assistant/webawesome/dist/components/divider/divider.js"
);

const ENTRIES = [
  {
    id: "ha-bottom-navigation",
    entryFile: abs("src/components/ha-bottom-navigation.ts"),
    externalize: {
      "../dialogs/quick-bar/ha-quick-bar-content": EMPTY_MODULE,
      "./ha-bottom-navigation-assist": EMPTY_MODULE,
      "./ha-icon": EMPTY_MODULE,
      "./ha-svg-icon": EMPTY_MODULE,
      "./item/ha-list-item-button": EMPTY_MODULE,
      "./list/ha-list-nav": EMPTY_MODULE,
      "./user/ha-user-badge": EMPTY_MODULE,
      "./ha-sidebar": VENDORED_COMPUTE_PANELS,
    },
  },
  {
    id: "ha-bottom-navigation-assist",
    entryFile: abs("src/components/ha-bottom-navigation-assist.ts"),
    externalize: {
      "@home-assistant/webawesome/dist/components/divider/divider":
        WEBAWESOME_DIVIDER,
      "./ha-alert": EMPTY_MODULE,
      "./ha-assist-chat": EMPTY_MODULE,
      "./ha-button": EMPTY_MODULE,
      "./ha-dropdown": EMPTY_MODULE,
      "./ha-dropdown-item": EMPTY_MODULE,
      "./ha-icon-next": EMPTY_MODULE,
      "./ha-spinner": EMPTY_MODULE,
      "./ha-svg-icon": EMPTY_MODULE,
    },
  },
  {
    id: "ha-search-pill",
    entryFile: abs("src/components/ha-search-pill.ts"),
    externalize: {
      "./ha-icon-button": EMPTY_MODULE,
      "./ha-svg-icon": EMPTY_MODULE,
      "../dialogs/quick-bar/show-dialog-quick-bar": SHIM_SHOW_QUICK_BAR,
      "../dialogs/voice-command-dialog/show-ha-voice-command-dialog":
        SHIM_SHOW_VOICE_COMMAND_DIALOG,
    },
  },
  {
    id: "ha-quick-bar-content",
    entryFile: abs("src/dialogs/quick-bar/ha-quick-bar-content.ts"),
    // Served at /ha_labs_static/labs/ha-quick-bar-content/ once registered
    // via add_lab.py --js-dir (this entry keeps two real async chunks - see
    // build.cjs header comment / final report for why).
    publicPath: "/ha_labs_static/labs/ha-quick-bar-content/",
    externalize: {
      "../../components/entity/state-badge": EMPTY_MODULE,
      "../../components/ha-combo-box-item": EMPTY_MODULE,
      "../../components/ha-domain-icon": EMPTY_MODULE,
      "../../components/ha-icon": EMPTY_MODULE,
      "../../components/ha-picker-combo-box": EMPTY_MODULE,
      "../../components/ha-spinner": EMPTY_MODULE,
      "../../components/ha-svg-icon": EMPTY_MODULE,
      "../../components/ha-tip": EMPTY_MODULE,
      "./show-dialog-quick-bar": VENDORED_EFFECTIVE_QUICK_BAR_MODE,
    },
  },
];

async function runOne(entry) {
  const config = buildEntryConfig(entry);
  return new Promise((resolve, reject) => {
    rspack.rspack(config, (err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      if (stats.hasErrors()) {
        console.error(
          stats.toString({
            colors: true,
            errorDetails: true,
            all: false,
            errors: true,
          })
        );
        reject(new Error(`Build failed for ${entry.id}`));
        return;
      }
      console.log(
        stats.toString({
          colors: true,
          chunks: false,
          modules: false,
          assets: true,
        })
      );
      resolve();
    });
  });
}

async function main() {
  fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  const only = process.argv[2];
  const entries = only ? ENTRIES.filter((e) => e.id === only) : ENTRIES;
  if (!entries.length) {
    console.error(`No matching entry for ${only}`);
    process.exit(1);
  }
  for (const entry of entries) {
    console.log(`\n=== Building ${entry.id} ===`);
    // eslint-disable-next-line no-await-in-loop
    await runOne(entry);
  }
  console.log("\nAll labs bundles built.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
