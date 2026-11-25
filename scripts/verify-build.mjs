import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const OUTPUT = '.output';
const MAX_JS_GZIP = 60 * 1024;
const MAX_CSS_GZIP = 15 * 1024;
const MAX_UNPACKED = 300 * 1024;

const failures = [];

function fail(message) {
  failures.push(message);
}

function findTarget(prefix) {
  if (!existsSync(OUTPUT)) fail(`Missing ${OUTPUT}; run the builds first.`);
  if (!existsSync(OUTPUT)) return null;

  const candidates = readdirSync(OUTPUT).filter((name) => {
    const dir = join(OUTPUT, name);
    return (
      statSync(dir).isDirectory() &&
      name.startsWith(prefix) &&
      existsSync(join(dir, 'manifest.json'))
    );
  });

  if (candidates.length === 0) {
    fail(`No ${prefix} build found under ${OUTPUT}.`);
    return null;
  }

  candidates.sort();
  return candidates[candidates.length - 1];
}

function walkFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...walkFiles(path));
    } else {
      files.push({ path, size: stat.size });
    }
  }
  return files;
}

function checkManifest(name, manifest, browser) {
  if (!manifest) return;

  if (manifest.manifest_version !== 3) fail(`${name}: expected manifest_version 3.`);
  if (manifest.default_locale !== 'en') fail(`${name}: default_locale must be en.`);

  const permissions = manifest.permissions ?? [];
  if (permissions.length !== 1 || permissions[0] !== 'proxy') {
    fail(`${name}: permissions must be exactly ["proxy"], got ${JSON.stringify(permissions)}.`);
  }
  if (manifest.host_permissions?.length) fail(`${name}: host_permissions must be empty.`);
  if (manifest.background) fail(`${name}: background must not be declared.`);

  if (manifest.action?.default_popup !== 'popup.html') {
    fail(`${name}: action.default_popup must be popup.html.`);
  }
  if (!manifest.action?.default_icon?.['128']) {
    fail(`${name}: action.default_icon 128 is missing.`);
  }
  if (!manifest.icons?.['128']) fail(`${name}: icons.128 is missing.`);

  const locales = manifest.default_locale;
  for (const locale of [locales, 'zh_CN']) {
    const file = join(OUTPUT, name, '_locales', locale, 'messages.json');
    if (!existsSync(file)) fail(`${name}: missing locale ${locale}.`);
  }

  if (browser === 'firefox') {
    const gecko = manifest.browser_specific_settings?.gecko;
    if (gecko?.id !== 'proxima@chenxu.dev') {
      fail(`${name}: gecko.id must be proxima@chenxu.dev, got ${String(gecko?.id)}.`);
    }
    if (!gecko?.strict_min_version) fail(`${name}: gecko.strict_min_version is missing.`);
    const dataCollection = gecko?.data_collection_permissions?.required;
    if (
      !Array.isArray(dataCollection) ||
      dataCollection.length !== 1 ||
      dataCollection[0] !== 'none'
    ) {
      fail(`${name}: data_collection_permissions.required must be ["none"].`);
    }
    if (manifest.minimum_chrome_version) {
      fail(`${name}: Firefox build must not set minimum_chrome_version.`);
    }
  } else {
    if (manifest.browser_specific_settings) {
      fail(`${name}: Chrome build must not contain browser_specific_settings.`);
    }
    if (manifest.minimum_chrome_version !== '120') {
      fail(`${name}: minimum_chrome_version must be 120.`);
    }
  }
}

function checkBytes(name, files) {
  const js = files.filter((file) => file.path.endsWith('.js'));
  const css = files.filter((file) => file.path.endsWith('.css'));
  const total = files.reduce((sum, file) => sum + file.size, 0);

  const jsGzip = js.reduce((sum, file) => sum + gzipSync(readFileSync(file.path)).length, 0);
  const cssGzip = css.reduce((sum, file) => sum + gzipSync(readFileSync(file.path)).length, 0);

  if (jsGzip > MAX_JS_GZIP) {
    fail(`${name}: JS gzip ${jsGzip} B exceeds ${MAX_JS_GZIP} B.`);
  }
  if (cssGzip > MAX_CSS_GZIP) {
    fail(`${name}: CSS gzip ${cssGzip} B exceeds ${MAX_CSS_GZIP} B.`);
  }
  if (total > MAX_UNPACKED) {
    fail(`${name}: unpacked size ${total} B exceeds ${MAX_UNPACKED} B.`);
  }

  console.log(
    `${name}: JS ${Math.round(jsGzip / 1024)} KB gzip, CSS ${Math.round(
      cssGzip / 1024,
    )} KB gzip, ${Math.round(total / 1024)} KB unpacked`,
  );
}

for (const [prefix, browser] of [
  ['firefox', 'firefox'],
  ['chrome', 'chrome'],
]) {
  const name = findTarget(prefix);
  if (!name) continue;

  const dir = join(OUTPUT, name);
  const manifestPath = join(dir, 'manifest.json');
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`${name}: manifest.json is not valid JSON (${error.message}).`);
  }

  checkManifest(name, manifest, browser);
  checkBytes(name, walkFiles(dir));
}

if (failures.length > 0) {
  console.error('\nBuild verification failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('\nBuild verification passed.');
