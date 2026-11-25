# AGENTS.md

Project guidance for AI agents and maintainers. The user-facing `README.md` is in Chinese and must stay friendly and usage-oriented; implementation notes, release requirements, testing details, and other maintainer-only information live in this file, in English.

## 1. What Proxima is

Proxima is a Firefox-first, Chrome-compatible WebExtension that provides a modern popup UI for the browser's **native proxy settings**. It is not a proxy client: it does not tunnel traffic, ship subscriptions, or test proxy connectivity. It only reads and writes the browser's proxy configuration.

The UI follows three product principles:

- **Visible state**: the popup always reflects the browser's actual configuration and its controller (Proxima, another extension, or policy).
- **High-frequency first**: mode switching and the common manual-proxy fields are visible immediately; the primary action is fixed at the bottom.
- **Progressive disclosure**: only the selected mode's fields are shown; separate HTTPS proxy, bypass list, and authentication options live under "Advanced".

## 2. Non-negotiable constraints

Unless a new plan explicitly changes these, keep them:

- **Popup only.** No background/service worker, no options page, no content script. The popup calls the proxy API directly; the browser persists the setting.
- **Minimal permissions.** `permissions: ["proxy"]` only. Do not add `host_permissions`, `storage`, `tabs`, or `scripting`.
- **No network access.** Never add `fetch`, `XMLHttpRequest`, WebSocket, analytics, or remote assets. PAC files are loaded by the browser, not by the extension.
- **No credentials.** Never store proxy usernames or passwords. Proxy authentication is handled by the browser.
- **Firefox first, Chrome compatible.** Both builds are Manifest V3.
- **Preact, not React.** Runtime dependencies should remain tiny. No CSS framework, icon library, web font, state library, or third-party i18n library.
- **Firefox extension ID is final:** `proxima@chenxu.dev`. It is required for MV3 signing; do not change it after publishing.
- **License is MIT.** The canonical text was downloaded from SPDX; only the copyright placeholder was filled. Do not rewrite the license body.
- **README is for users.** Keep `README.md` focused on what the extension does, installation, usage, privacy, and limitations. Do not put release checklists, lint warning counts, file trees, or license provenance there; put maintainer details here.

## 3. Toolchain and commands

Requirements: Node.js >= 20, npm. WXT 0.21.x, Vite 7.x, Preact 10.x, TypeScript 5.9.x, Vitest 4.x, jsdom 26.x.

```sh
npm install
npm run dev             # Firefox
npm run dev:chrome      # Chrome
npm run build:firefox
npm run build:chrome
npm run typecheck
npm test
npm run verify:build    # requires both builds
npm run lint:firefox    # requires the Firefox build
npm run check           # typecheck + tests + both builds + verify:build
npm run format          # Prettier write
npm run format:check
npm run zip:firefox
npm run zip:chrome
```

Environment notes:

- The root `postinstall` runs `scripts/postinstall.mjs`, which runs `wxt prepare` when WXT is installed. It deliberately succeeds without dev dependencies so production-only installs do not fail.
- If `NODE_ENV=production` causes npm to skip devDependencies, use `npm install --include=dev`.
- `.wxt/` and `.output/` are generated and gitignored.
- Build outputs: `.output/firefox-mv3` and `.output/chrome-mv3`.
- `npm run check` does not include `web-ext lint` or Prettier; run those separately when relevant.

## 4. Repository layout

```text
public/
  _locales/en/messages.json       UI + manifest strings (English)
  _locales/zh_CN/messages.json    UI + manifest strings (Chinese)
  icon-*.png                      Toolbar/extension icons
src/
  entrypoints/popup/              Popup HTML, main entry, App
  components/                     Presentational popup components
  lib/proxy/                      Model, validation, mappers, client, descriptions
  lib/i18n/                       The only browser.i18n/browser adapter layer
  lib/draft.ts                    localStorage draft persistence
  lib/useProxyForm.ts             Popup state machine
  styles/                         Design tokens and global popup CSS
scripts/
  postinstall.mjs                 Resilient `wxt prepare`
  verify-build.mjs                Manifest, permission, icon, and size checks
tests/                            Vitest unit/component tests
design/icon.svg                   Icon source
wxt.config.ts                     WXT manifest generation
```

## 5. Data model and flow

```text
popup UI -> useProxyForm -> ProxyClient -> browser.proxy.settings
                        \-> localStorage (draft only)
```

- `ProxyClient` (`src/lib/proxy/client.ts`) exposes `load()` and `apply(config)`.
- `createBrowserApi()` is the low-level adapter for `browser.proxy.settings` (Firefox) and `chrome.proxy.settings` (Chrome). It is created lazily.
- `load()` reads the browser state, normalizes it through `fromFirefox()` or `fromChrome()`, and returns a `ClientSnapshot` containing the config, `levelOfControl`, private-window access, platform, raw value, and any read error.
- `apply()` maps the normalized config through `toFirefox()` or `toChrome()`, calls `set()`, and then re-reads. A successful write plus a failed read-back is reported as "applied, but unverified".
- The browser is the source of truth. The popup never assumes a write succeeded without reading it back.
- The draft is stored under `localStorage` key `proxima.draft.v1` as `{ v: 1, savedAt, model }`. Corrupt/unknown drafts are removed. Draft storage is best-effort.
- The bypass chip input is controlled by `useProxyForm.bypassPending`, not by the component. Pending text is merged into the manual config before validation/application.
- `Endpoint.port` is a string in the model/UI (so users can clear it while editing); mappers convert it to a number only after validation.

### Normalized config

```ts
type Mode = 'direct' | 'system' | 'autoDetect' | 'pac' | 'manual';
type Endpoint = { host: string; port: string };

type ManualConfig = {
  http: Endpoint | null;
  https: Endpoint | null;
  shareHttps: boolean;
  socks: Endpoint | null;
  socksVersion: 4 | 5;
  proxyDns: boolean; // Firefox only
  bypass: string[];
  autoLogin: boolean; // Firefox only
};
```

`https` is mutually exclusive with `shareHttps`. The UI clears sharing when a separate HTTPS proxy is entered. SOCKS and HTTP can coexist.

## 6. Browser API details

### Firefox (`browser.proxy.settings`)

- `proxyType` values: `none`, `system`, `autoDetect`, `manual`, `autoConfig`.
- Manual fields: `http`, `ssl`, `socks`, `socksVersion`, `passthrough` (comma-separated string), `autoLogin`, `proxyDNS`, `httpProxyAll`.
- When sharing HTTP with HTTPS, write `httpProxyAll: true` and omit `ssl`; Firefox copies `http` into `ssl`.
- Omitted fields reset their prefs to defaults. Always send the complete set of fields relevant to the selected mode.
- Do not write `ftp` (deprecated) and do not expose Firefox's "system WPAD" (`network.proxy.type = 5`); the extension API has no `proxyType` value for it.
- `proxy.settings.set()` requires the extension to be allowed in private windows. If `extension.isAllowedIncognitoAccess()` is false, block Apply and show the setup card. The raw API error is `proxy.settings requires private browsing permission.`
- `proxy.settings.get()` can throw when Firefox is on the system WPAD type 5 setting. Treat it as a read failure and tell the user to choose another mode in Firefox settings.
- `set()` resolves to `false` when the change was not accepted; map that to `not-applied`.
- `levelOfControl` values: `not_controllable`, `controlled_by_other_extensions`, `controllable_by_this_extension`, `controlled_by_this_extension`.

### Chrome (`chrome.proxy.settings`)

- Uses callback-based `ChromeSetting` APIs; `lastError` must be read inside callbacks.
- Modes: `direct`, `system`, `auto_detect`, `pac_script`, `fixed_servers`.
- Manual mapping:
  - HTTP only: `rules.proxyForHttp`; add `rules.proxyForHttps` when shared or separately configured.
  - SOCKS only: `rules.singleProxy` with `scheme: "socks4" | "socks5"`.
  - HTTP + SOCKS: `proxyForHttp` / `proxyForHttps` + `fallbackProxy` SOCKS.
  - Bypass: `rules.bypassList` array.
- PAC: `{ mode: "pac_script", pacScript: { url, mandatory: false } }`. Inline `pacScript.data` is unsupported and read as unknown.
- Chrome has no equivalents for `proxyDNS`, `autoLogin`, or `httpProxyAll`; hide those controls on Chrome.
- Proxy schemes `https` and `quic` (TLS-to-proxy / QUIC proxy) are not representable in the model; read them as unknown.
- Only the regular scope is written; incognito scope is not handled.
- Only claim what the API supports. When another extension controls the setting, allow an attempt, re-read, and warn if control remains elsewhere.

## 7. State machine and UX invariants

`src/lib/useProxyForm.ts` is the single source of popup state. Blocking reasons, in priority order:

1. `loading`
2. `unsupported-platform`
3. `read-error`
4. `unknown`
5. `policy`
6. `private-browsing`

Rules:

- Editing is allowed with a known config, except during apply/refresh and when policy-locked.
- Applying is blocked for `private-browsing` and `policy`; other-extension control is a warning, not a block.
- Applying is always explicit (Apply button or Enter in a text field). There is no auto-apply.
- The browser is re-read after every apply and manual refresh. Do not display "connected"; the extension cannot know whether the proxy is reachable.
- Show the actual browser config in the status card even while a draft exists; indicate unsaved edits separately.
- Draft restore is announced; "Discard" reverts to the browser config.
- Read failures, policy, other-extension control, private-window access, and unknown configs must each have visible text and an actionable next step.
- Keep the popup at 380px wide, max-height 600px, with a fixed action bar and scrollable content.

## 8. i18n policy

- Components must depend only on the `I18n` interface (`src/lib/i18n/types.ts`).
- `browser.i18n` / `chrome.i18n` may only be touched by `src/lib/i18n/adapter.ts`.
- v1 ships exactly `en` and `zh_CN` in `public/_locales/`. Do not add other locales without a product decision.
- `uiLocale` is a sentinel message in each catalog; it tells the adapter which catalog the browser actually selected.
- `MessageKey` is derived from the English JSON via a type-only import. Keep the key sets identical across locales; `tests/i18n.test.ts` enforces parity.
- Messages use browser `$1`/`$2` placeholders. There is no plural engine; add separate keys if needed.
- To add a locale: add `public/_locales/<lang>/messages.json`, update `SupportedLocale` and `normalizeLocale`; no component changes.
- Do not hardcode user-visible strings; technical labels such as HTTP, HTTPS, SOCKS, PAC, and WPAD are fine.
- The manifest name/description/action title are localized through the same `_locales` files.

## 9. Testing and verification

- `npm test` runs Vitest with jsdom. Tests cover validation, Firefox/Chrome mapping and read-back, client error branches, draft handling, i18n key parity, and popup interactions.
- Component tests inject a fake `ProxyClient` and a real `I18n` instance; keep `App` testable through its `client` prop.
- `tests/setup.ts` stubs `browser.i18n` with the English catalog and clears `localStorage` between tests.
- Add tests for every new mapping branch, validation rule, or API failure mode.
- `npm run verify:build` asserts:
  - Manifest V3 and `default_locale: en`.
  - Exactly one permission: `proxy`.
  - No `background`, no `host_permissions`.
  - Popup and 128px icons exist.
  - Firefox has gecko ID `proxima@chenxu.dev`, `strict_min_version`, and `data_collection_permissions.required = ["none"]`.
  - Chrome has `minimum_chrome_version: "120"` and no gecko block.
  - JS gzip < 60 KB, CSS gzip < 15 KB, unpacked < 300 KB.
- Current sizes are approximately 17 KB JS gzip, 3 KB CSS gzip, 93 KB unpacked.
- `web-ext lint` is expected to report **0 errors and 2 warnings**:
  - Android minimum-version warning caused by the desktop-only `data_collection_permissions` field.
  - `UNSAFE_VAR_ASSIGNMENT` from Preact's runtime; source code contains no `innerHTML`.
    Do not suppress these without understanding the cause.
- The development environment used for this repository had no Firefox or Chrome binary. Do not claim a live browser smoke test unless one was actually performed.
- Firefox temporary add-ons are removed on restart. Persistence must be verified with a signed or Developer Edition unsigned install, not a temporary add-on.

## 10. Release and repository notes

- Version lives in `package.json`; WXT derives the manifest version.
- Firefox target: Manifest V3, `strict_min_version: "140.0"`, gecko ID `proxima@chenxu.dev`, data collection `["none"]`. AMO requires the data-collection declaration for new submissions.
- Firefox for Android does not support `proxy.settings`. The extension is desktop-only even though AMO may show an Android compatibility warning.
- Chrome target: Manifest V3, `minimum_chrome_version: "120"`, only the `proxy` permission, no host permissions, no background.
- Package with `npm run zip:firefox` / `npm run zip:chrome`. Artifacts are generated from `.output`.
- License: MIT. The license text came from SPDX (`MIT.txt`); only `<year>` and `<copyright holders>` were replaced with `2026` and `chenxu`.
- Do not change publishing metadata without an explicit request.
- README must remain user-facing. If a change needs maintainer explanation, document it here instead.

## 11. Known technical limitations

- No profiles, presets, per-domain rules, subscriptions, import/export, or proxy connectivity test.
- No proxy credential management.
- Firefox system WPAD (`network.proxy.type = 5`) cannot be read through the proxy API; the popup shows a read error and asks the user to switch modes.
- Firefox's proxy API mishandles IPv6 hosts with ports (`split(':')` in Gecko); ports may fall back to defaults.
- Chrome inline PAC scripts are not editable; PAC cannot be force-reloaded through the extension API.
- Chrome `fallbackProxy` means HTTPS may also use SOCKS when HTTP and SOCKS are both configured; Firefox's mixed-proxy behavior can differ.
- Chrome TLS-to-proxy (`https` scheme) and QUIC proxy schemes are read as unknown.
- Chrome incognito proxy scope is not handled separately.
- FTP proxies are not exposed.
- Firefox for Android is unsupported.
- Only English and Chinese UI catalogs exist; there is no in-app language switch.

## 12. Change checklist

Before finishing a code change:

1. Preserve the popup-only, proxy-only, no-network architecture unless the plan explicitly changes it.
2. Update both `en` and `zh_CN` catalogs for any new user-visible string, and keep key parity.
3. Add or update tests for validation, mapping, client behavior, or UI state changes.
4. Run `npm run typecheck`, `npm test`, `npm run build:firefox`, `npm run build:chrome`, `npm run verify:build`.
5. Run `npm run lint:firefox` and `npm run format:check` when relevant.
6. Inspect both generated manifests for permission, background, and gecko/Chrome metadata drift.
7. Keep README user-facing; put architecture, release, and test details here.
8. Do not change the gecko ID, license text, or permission model without an explicit user decision.
9. Avoid new runtime dependencies unless they are justified and the size budget still passes.

## 13. References

- [Firefox `proxy.settings`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy/settings)
- [Chrome `chrome.proxy`](https://developer.chrome.com/docs/extensions/reference/api/proxy)
- [WXT](https://wxt.dev/)
- [SPDX MIT license text](https://github.com/spdx/license-list-data/blob/main/text/MIT.txt)
- [AMO data collection permissions](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
