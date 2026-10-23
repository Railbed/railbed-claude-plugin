#!/usr/bin/env node
// Checks the Railbed plugin for Claude before it is published.
//
//   node scripts/validate.mjs          (from the plugin root; Node 20 or later, no dependencies)
//
// It exits 1 and lists every problem when a check fails. The checks:
//   - .claude-plugin/plugin.json: known keys only, a kebab-case name, a strict semantic version, a description, an author
//     with a name, a permissive MIT licence, https homepage, repository and listing URLs, a committed square PNG icon, and
//     relative "./" paths that stay in the plugin.
//   - .claude-plugin/marketplace.json lists exactly this plugin, at "./", under the same name.
//   - CHANGELOG.md's newest "## <version>" heading is the plugin's version.
//   - .mcp.json has exactly one server: Railbed's hosted server over https, with no headers, credentials, commands or
//     ${VARIABLE} placeholders (sign-in happens in the browser).
//   - Skills and agents have the frontmatter Claude reads. Agents only read: they declare their tools, never a tool that
//     writes or runs code, and only Railbed's public docs tools from the MCP server.
//   - Only expected files: no hooks, commands, executables, LSP, monitors or settings; no symlinks, no file over 1 MB, no
//     node_modules, no .env files and no executable files.
//   - No secrets and no misleading product names in any text file (see "What the secret scan allows" below).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Every key this plugin's manifest may use. Claude Code reads more (FORBIDDEN_KEYS below); any other key fails.
const PLUGIN_KEYS = ['name', 'displayName', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords',
  'icon', 'documentationUrl', 'supportUrl', 'privacyPolicyUrl', 'termsOfServiceUrl', 'skills', 'agents', 'mcpServers'];
const URL_KEYS = ['homepage', 'repository', 'documentationUrl', 'supportUrl', 'privacyPolicyUrl', 'termsOfServiceUrl'];
const MARKETPLACE_KEYS = ['name', 'owner', 'metadata', 'plugins'];
const MARKETPLACE_METADATA_KEYS = ['description', 'version'];
const MARKETPLACE_ENTRY_KEYS = ['name', 'source', 'description', 'version', 'category', 'tags'];
const PERSON_KEYS = ['name', 'email', 'url'];
const COMPONENT_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// A strict semantic version, as semver.org defines it (no build metadata).
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;
const EMAIL = /^[^\s@"<>()[\]\\,;:]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const LICENSES = ['MIT', 'MIT-0'];
const COMPONENT_FIELDS = ['skills', 'agents'];
const MCP_HOSTS = new Set(['mcp.railbed.io']);
const MCP_SERVER_KEYS = ['type', 'url'];
const MCP_CREDENTIAL_KEYS = ['headers', 'headersHelper', 'env', 'auth', 'oauth', 'command', 'args', 'cwd'];
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_SKILL_DESCRIPTION = 1024;
const TEXT_EXTENSIONS = new Set(['.json', '.md', '.svg', '.mjs', '.yml', '.txt']);
const BINARY_EXTENSIONS = new Set(['.png']);
const EXTENSIONLESS_FILES = new Set(['LICENSE', '.gitignore']);
// The plugin ships nothing that runs on the user's machine or changes their settings: hooks run code without a prompt,
// commands and bin/ executables add actions, LSP servers and monitors start processes, settings.json and CLAUDE.md change
// how every session behaves. Shipping any of them is a deliberate, reviewed decision that starts by changing these lists.
const FORBIDDEN_ROOT = new Map([
  ['hooks', 'the plugin ships no hooks'],
  ['bin', 'the plugin ships no executables'],
  ['commands', 'the plugin ships no commands; skills cover its workflows'],
  ['monitors', 'the plugin ships no monitors'],
  ['.lsp.json', 'the plugin ships no LSP servers'],
  ['settings.json', 'the plugin changes no settings'],
  ['CLAUDE.md', 'the plugin adds no always-loaded instructions'],
]);
const FORBIDDEN_KEYS = new Map([
  ['hooks', 'the plugin ships no hooks'],
  ['commands', 'the plugin ships no commands'],
  ['lspServers', 'the plugin ships no LSP servers'],
  ['outputStyles', 'the plugin ships no output styles'],
  ['monitors', 'the plugin ships no monitors'],
  ['userConfig', 'the plugin asks for no settings; Railbed sign-in happens in the browser'],
]);
// Agents only read. Any tool that writes files, runs commands or starts another agent fails, and so does a wildcard.
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent', 'Task']);
const AGENT_KEYS_NOT_ALLOWED = ['permissionMode', 'hooks', 'mcpServers'];
// Skills pre-approve nothing: every tool call, Railbed's included, goes through the host's normal permission prompt.
const SKILL_KEYS_NOT_ALLOWED = ['allowed-tools', 'allowedTools'];
// The MCP tools an agent may use: Railbed's public docs tools, under the plugin's own server prefix
// (mcp__plugin_<plugin>_<server>__) or a manually added server of the same name (mcp__<server>__), which Claude Code
// keeps instead of the plugin's when both point at the same URL.
const AGENT_MCP_TOOLS = ['railbed_docs_search', 'railbed_docs_read'];

// What the secret scan allows. Documentation may show the shape of a credential, never a real one. A match passes only when
// it is plainly a placeholder: it contains "x" four or more times in a row, "...", an ellipsis, angle brackets or one of
// the words example, placeholder, your, redacted, dummy, fake or sample; or it uses fewer than ten distinct characters
// (rb_test_000000000000000000000000). A 0x-prefixed 64-hex value also passes on a line that says it is a transaction or
// hash (tx, txid, transaction, hash), since an on-chain transaction hash has the same shape as a private key. Private key
// blocks never pass. A line of 12, 15, 18, 21 or 24 lowercase words and nothing else reads as a recovery phrase and fails
// unless it repeats words (word word word ...).
const PLACEHOLDER = /x{4,}|\.{3}|\u2026|[<>]|example|placeholder|your|redacted|dummy|fake|sample/i;
const SECRET_PATTERNS = [
  { label: 'a Railbed secret key', pattern: /\brb_(?:live|test)_[A-Za-z0-9_-]{16,}/g },
  { label: 'a webhook signing secret', pattern: /\bwhsec_[A-Za-z0-9_+/=-]{16,}/g },
  { label: 'a private key block', pattern: new RegExp('-'.repeat(5) + 'BEGIN[A-Z0-9 ]*' + '-'.repeat(5), 'g'), strict: true },
  { label: 'a JSON web token', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { label: 'a bearer token', pattern: /\bBearer[ \t]+([A-Za-z0-9._~+/-]{20,}=*)/g },
  { label: 'a 0x-prefixed 64-hex private key', pattern: /\b0x[0-9a-fA-F]{64}\b/g, hashContext: true },
  { label: 'a third-party API token', pattern: /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abposr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})/g },
];
const HASH_CONTEXT = /\b(?:tx|txid|tx_hash|txhash|transaction|hash)\b/i;
const PHRASE_LENGTHS = new Set([12, 15, 18, 21, 24]);

// Naming rules for the listing. The names are assembled so this file passes its own scan. The host rule applies to the
// prose an assistant reads or a person sees first (PROSE_FILE); the others to every text file.
const PROSE_FILE = /^(?:(?:skills|agents)\/.+\.md|README\.md)$/;
const PROSE_RULES = [
  { pattern: new RegExp('\\bClaude ' + 'AI\\b', 'g'), why: 'call it "Claude" or "Claude Code"' },
  { pattern: /\p{Emoji_Presentation}|\p{Regional_Indicator}|\uFE0F|\u200D/gu, why: 'no emoji' },
];
const HOST_RULES = [
  { pattern: new RegExp('\\b(?:Cur' + 'sor|Gr' + 'ok)\\b', 'g'), why: 'this plugin is for Claude; keep other hosts out of it' },
  { pattern: new RegExp('\\b(?:Chat' + 'GPT|Co' + 'dex)\\b', 'gi'), why: 'this plugin is for Claude; keep other hosts out of it' },
];

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const toPosix = path => path.split(sep).join('/');

/**
 * Minimal YAML frontmatter reader for the simple shapes Claude's components use: `key: value` (plain, 'single' or
 * "double" quoted), folded or literal block scalars (`>`, `>-`, `|`, `|-`), plain values continued on indented lines and
 * `- item` lists. Returns { fields } or { error }.
 */
export function parseFrontmatter(text) {
  const source = text.replace(/\r\n/g, '\n');
  const match = /^---\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/.exec(source);
  if (!match) return { error: 'missing YAML frontmatter (the file must start with a line "---" and close it with another)' };
  const lines = (match[1] ?? '').split('\n');
  const fields = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const pair = /^([A-Za-z_][A-Za-z0-9_-]*):(?:[ \t]+(.*?))?[ \t]*$/.exec(line);
    if (!pair) return { error: `frontmatter line ${i + 2} is not a "key: value" pair` };
    const [, key, raw = ''] = pair;
    if (Object.hasOwn(fields, key)) return { error: `frontmatter repeats "${key}"` };
    const continued = [];
    while (i + 1 < lines.length && (/^[ \t]/.test(lines[i + 1]) || lines[i + 1].trim() === '')) continued.push(lines[++i]);
    while (continued.length && continued.at(-1).trim() === '') continued.pop();
    const value = frontmatterValue(raw, continued);
    if (value.error) return { error: `frontmatter "${key}": ${value.error}` };
    fields[key] = value.value;
  }
  return { fields };
}

function frontmatterValue(raw, continued) {
  const indent = Math.min(...continued.filter(line => line.trim()).map(line => line.search(/\S/)));
  const body = continued.map(line => (line.trim() ? line.slice(indent) : ''));
  if (/^[>|][+-]?$/.test(raw)) {
    if (raw[0] === '|') return { value: body.join('\n').trim() };
    // Folded: single line breaks become spaces, blank lines become line breaks.
    return { value: body.join('\n').replace(/([^\n])\n(?=[^\n])/g, '$1 ').replace(/\n\n/g, '\n').trim() };
  }
  if (raw === '' && body.length && body.every(line => !line || /^- /.test(line))) {
    return { value: body.filter(Boolean).map(line => line.slice(2).trim().replace(/^(['"])(.*)\1$/, '$2')) };
  }
  const joined = [raw, ...body.map(line => line.trim())].filter(Boolean).join(' ');
  if (raw.startsWith('"')) {
    try { return { value: JSON.parse(joined) }; } catch { return { error: 'unterminated or invalid double-quoted value' }; }
  }
  if (raw.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(joined)) return { error: 'unterminated single-quoted value' };
    return { value: joined.slice(1, -1).replace(/''/g, "'") };
  }
  if (/^[@`]/.test(joined)) return { error: 'a plain value cannot start with @ or `; quote it' };
  if (/:\s/.test(joined) || /:$/.test(joined)) return { error: 'a plain value contains ": ", which YAML reads as a new key; quote it or use >-' };
  if (/\s#/.test(joined)) return { error: 'a plain value contains " #", which YAML reads as a comment; quote it or use >-' };
  return { value: joined };
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\') || value.includes('\0')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return false;
  return !value.split('/').includes('..');
}

function gitTrackedFiles(root) {
  try {
    const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (realpathSync(top) !== realpathSync(root)) return null;
    return new Set(execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean));
  } catch {
    return null;
  }
}

/** An agent's `tools` frontmatter, a comma-separated string or a list, as trimmed names. */
function toolList(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return list.map(tool => String(tool).trim()).filter(Boolean);
}

/**
 * Validates the plugin folder at `root`. Never throws for a plugin problem; returns every error found, plus the
 * deterministic file inventory (sorted POSIX paths with size and sha256) that a publish copies byte for byte.
 */
export function validatePlugin(root = process.cwd()) {
  root = resolve(root);
  const errors = [];
  const fail = message => errors.push(message);
  const files = [];
  const texts = new Map();

  // Inventory: every file that would be published.
  const walk = directory => {
    for (const name of readdirSync(directory).sort()) {
      const full = join(directory, name), rel = toPosix(relative(root, full));
      if (directory === root && name === '.git') continue;
      if (name === '.DS_Store') continue; // Finder metadata: ignored by .gitignore and never published.
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) { fail(`${rel}: symlinks are not allowed in the plugin`); continue; }
      if (directory === root && FORBIDDEN_ROOT.has(name)) {
        fail(`${rel}${stat.isDirectory() ? '/' : ''}: ${FORBIDDEN_ROOT.get(name)} (see FORBIDDEN_ROOT in scripts/validate.mjs)`);
        continue;
      }
      if (stat.isDirectory()) {
        if (name === 'node_modules') { fail(`${rel}/: node_modules must never be published`); continue; }
        walk(full);
        continue;
      }
      if (!stat.isFile()) { fail(`${rel}: not a regular file`); continue; }
      if (/^\.env(?:\..*)?$/i.test(name)) { fail(`${rel}: .env files must never be published`); continue; }
      if (stat.size > MAX_FILE_BYTES) fail(`${rel}: ${stat.size} bytes; files must be 1 MB or smaller`);
      if (stat.mode & 0o111) fail(`${rel}: executable files are not allowed (run scripts with node; chmod -x the file)`);
      const extension = extname(name).toLowerCase();
      const known = TEXT_EXTENSIONS.has(extension) || BINARY_EXTENSIONS.has(extension) || (EXTENSIONLESS_FILES.has(name) && directory === root);
      if (!known) fail(`${rel}: unexpected file type (allowed: ${[...TEXT_EXTENSIONS, ...BINARY_EXTENSIONS].join(' ')}, LICENSE and .gitignore)`);
      const bytes = readFileSync(full);
      files.push({ path: rel, bytes: stat.size, sha256: sha256(bytes) });
      if (!BINARY_EXTENSIONS.has(extension)) texts.set(rel, bytes.toString('utf8'));
    }
  };
  walk(root);
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const has = path => files.some(file => file.path === path);
  const hasDirectory = path => files.some(file => file.path.startsWith(path.replace(/\/?$/, '/')));

  const readJson = path => {
    if (!texts.has(path)) { fail(`${path}: missing`); return null; }
    try { return JSON.parse(texts.get(path)); } catch (error) { fail(`${path}: invalid JSON (${error.message})`); return null; }
  };
  const checkKeys = (value, allowed, where, forbidden = new Map()) => {
    for (const key of Object.keys(value)) {
      if (forbidden.has(key)) fail(`${where}.${key}: ${forbidden.get(key)} (see FORBIDDEN_KEYS in scripts/validate.mjs)`);
      else if (!allowed.includes(key)) fail(`${where}: unknown key "${key}" (allowed: ${allowed.join(', ')})`);
    }
  };
  const checkHttps = (value, where) => {
    let url;
    try { url = new URL(value); } catch { fail(`${where}: must be an https URL`); return null; }
    if (url.protocol !== 'https:' || url.username || url.password) fail(`${where}: must be an https URL without credentials`);
    return url;
  };
  const checkPerson = (value, where) => {
    if (!isObject(value)) { fail(`${where}: must be an object with a name`); return; }
    checkKeys(value, PERSON_KEYS, where);
    if (typeof value.name !== 'string' || !value.name.trim()) fail(`${where}.name: required`);
    if (value.email !== undefined && (typeof value.email !== 'string' || !EMAIL.test(value.email))) fail(`${where}.email: must be an email address`);
    if (value.url !== undefined) {
      if (typeof value.url !== 'string') fail(`${where}.url: must be an https URL`);
      else checkHttps(value.url, `${where}.url`);
    }
  };
  const checkPath = (value, where, kind) => {
    if (!isSafeRelativePath(value)) { fail(`${where}: "${value}" must be a relative path inside the plugin (no "..", no absolute path, no URL)`); return false; }
    if (!value.startsWith('./')) { fail(`${where}: "${value}" must start with "./"`); return false; }
    if (/[*?[\]{}]/.test(value)) { fail(`${where}: "${value}" must be a plain path, not a glob`); return false; }
    const target = toPosix(relative(root, resolve(root, value)));
    const found = kind === 'directory' ? hasDirectory(target) : has(target);
    if (!found) fail(`${where}: "${value}" does not exist${kind === 'directory' ? ' or is empty' : ''}`);
    return found;
  };

  // plugin.json
  const manifest = readJson('.claude-plugin/plugin.json');
  if (manifest && !isObject(manifest)) fail('.claude-plugin/plugin.json: must be a JSON object');
  if (isObject(manifest)) {
    const where = 'plugin.json';
    checkKeys(manifest, PLUGIN_KEYS, where, FORBIDDEN_KEYS);
    if (typeof manifest.name !== 'string' || !COMPONENT_NAME.test(manifest.name)) fail(`${where}.name: must be kebab-case (${COMPONENT_NAME})`);
    if (typeof manifest.version !== 'string' || !SEMVER.test(manifest.version)) fail(`${where}.version: must be a strict semantic version such as 1.0.0`);
    if (typeof manifest.description !== 'string' || !manifest.description.trim()) fail(`${where}.description: required`);
    if (manifest.displayName !== undefined && (typeof manifest.displayName !== 'string' || !manifest.displayName.trim())) fail(`${where}.displayName: must be nonblank text`);
    if (manifest.keywords !== undefined && !(Array.isArray(manifest.keywords) && manifest.keywords.every(item => typeof item === 'string' && item.trim()))) fail(`${where}.keywords: must be a list of text`);
    checkPerson(manifest.author, `${where}.author`);
    for (const key of URL_KEYS) {
      if (typeof manifest[key] !== 'string') fail(`${where}.${key}: required https URL`);
      else checkHttps(manifest[key], `${where}.${key}`);
    }
    if (!LICENSES.includes(manifest.license)) fail(`${where}.license: must be one of ${LICENSES.map(id => `"${id}"`).join(', ')}`);

    // Icon: committed, relative, an actual square PNG.
    if (typeof manifest.icon !== 'string') fail(`${where}.icon: required (a relative path to a committed PNG)`);
    else if (checkPath(manifest.icon, `${where}.icon`, 'file')) {
      const icon = toPosix(relative(root, resolve(root, manifest.icon)));
      const bytes = readFileSync(join(root, icon));
      const png = bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (extname(icon).toLowerCase() !== '.png' || !png) fail(`${where}.icon: ${icon} must be a PNG file`);
      else if (bytes.readUInt32BE(16) !== bytes.readUInt32BE(20) || bytes.readUInt32BE(16) < 128) fail(`${where}.icon: ${icon} must be square and at least 128 pixels wide`);
      const tracked = gitTrackedFiles(root);
      if (tracked && !tracked.has(icon)) fail(`${where}.icon: ${icon} is not committed (git add it)`);
    }

    // Component paths: a path or list of paths, each relative and present.
    for (const field of COMPONENT_FIELDS) {
      const value = manifest[field];
      if (value === undefined) continue;
      const list = typeof value === 'string' ? [value] : value;
      if (!Array.isArray(list) || list.length === 0 || !list.every(item => typeof item === 'string')) { fail(`${where}.${field}: must be a path or a list of paths`); continue; }
      for (const item of list) checkPath(item, `${where}.${field}`, 'directory');
    }
    if (manifest.mcpServers !== undefined) {
      if (typeof manifest.mcpServers !== 'string') fail(`${where}.mcpServers: must reference the plugin's .mcp.json file, not inline configuration`);
      else if (checkPath(manifest.mcpServers, `${where}.mcpServers`, 'file') && toPosix(relative(root, resolve(root, manifest.mcpServers))) !== '.mcp.json') {
        fail(`${where}.mcpServers: must be "./.mcp.json"`);
      }
    }
  }
  const version = isObject(manifest) ? manifest.version : undefined;
  const pluginName = isObject(manifest) && typeof manifest.name === 'string' ? manifest.name : undefined;

  // marketplace.json
  const marketplace = readJson('.claude-plugin/marketplace.json');
  if (marketplace && !isObject(marketplace)) fail('.claude-plugin/marketplace.json: must be a JSON object');
  if (isObject(marketplace)) {
    const where = 'marketplace.json';
    checkKeys(marketplace, MARKETPLACE_KEYS, where);
    if (typeof marketplace.name !== 'string' || !COMPONENT_NAME.test(marketplace.name)) fail(`${where}.name: must be kebab-case (${COMPONENT_NAME})`);
    checkPerson(marketplace.owner, `${where}.owner`);
    if (marketplace.metadata !== undefined) {
      if (!isObject(marketplace.metadata)) fail(`${where}.metadata: must be an object`);
      else {
        checkKeys(marketplace.metadata, MARKETPLACE_METADATA_KEYS, `${where}.metadata`);
        if (marketplace.metadata.description !== undefined && typeof marketplace.metadata.description !== 'string') fail(`${where}.metadata.description: must be text`);
        if (marketplace.metadata.version !== undefined && marketplace.metadata.version !== version) fail(`${where}.metadata.version: "${marketplace.metadata.version}" must equal plugin.json's version "${version}"`);
      }
    }
    if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length !== 1) fail(`${where}.plugins: must list exactly one plugin, this one`);
    else {
      const entry = marketplace.plugins[0], at = `${where}.plugins[0]`;
      if (!isObject(entry)) fail(`${at}: must be an object`);
      else {
        checkKeys(entry, MARKETPLACE_ENTRY_KEYS, at);
        if (entry.name !== pluginName) fail(`${at}.name: "${entry.name}" must equal plugin.json's name "${pluginName}"`);
        if (entry.source !== './') fail(`${at}.source: must be "./" (this repository is the plugin)`);
        if (entry.description !== undefined && typeof entry.description !== 'string') fail(`${at}.description: must be text`);
        if (entry.version !== undefined && entry.version !== version) fail(`${at}.version: "${entry.version}" must equal plugin.json's version "${version}"`);
      }
    }
  }

  // CHANGELOG.md
  if (texts.has('CHANGELOG.md') && version !== undefined) {
    const heading = /^##[ \t]+(.+)$/m.exec(texts.get('CHANGELOG.md'));
    const newest = heading && /^\[?v?([^\s\]]+)/.exec(heading[1].trim())?.[1];
    if (!heading) fail('CHANGELOG.md: has no "## <version>" heading');
    else if (newest !== version) fail(`CHANGELOG.md: newest heading "## ${heading[1].trim()}" must start with plugin.json's version ${version}`);
  }

  // .mcp.json
  const mcp = readJson('.mcp.json');
  const mcpServerNames = [];
  if (mcp !== null) {
    const raw = texts.get('.mcp.json');
    if (isObject(mcp) && isObject(mcp.mcpServers)) mcpServerNames.push(...Object.keys(mcp.mcpServers));
    if (raw.includes('${')) fail('.mcp.json: ${...} placeholders are not allowed (the plugin asks for no settings)');
    if (!isObject(mcp) || Object.keys(mcp).join() !== 'mcpServers' || !isObject(mcp.mcpServers) || Object.keys(mcp.mcpServers).length !== 1) {
      fail('.mcp.json: must be exactly {"mcpServers": {...}} with exactly one server');
    } else {
      for (const [name, server] of Object.entries(mcp.mcpServers)) {
        const at = `.mcp.json server "${name}"`;
        if (!COMPONENT_NAME.test(name)) fail(`${at}: name must match ${COMPONENT_NAME}`);
        if (!isObject(server)) { fail(`${at}: must be an object`); continue; }
        for (const key of Object.keys(server)) {
          if (MCP_SERVER_KEYS.includes(key)) continue;
          if (MCP_CREDENTIAL_KEYS.includes(key)) fail(`${at}: "${key}" is not allowed; the server is remote and the user signs in with OAuth in the browser`);
          else fail(`${at}: unknown key "${key}" (allowed: ${MCP_SERVER_KEYS.join(', ')})`);
        }
        if (server.type !== 'http') fail(`${at}: type must be "http"`);
        const url = typeof server.url === 'string' ? checkHttps(server.url, `${at} url`) : (fail(`${at}: url is required`), null);
        if (url && !MCP_HOSTS.has(url.hostname)) fail(`${at}: host "${url.hostname}" is not allowed (allowed: ${[...MCP_HOSTS].join(', ')})`);
        if (url && (url.search || url.hash || url.port)) fail(`${at}: url must have no port, query or fragment`);
      }
    }
  }
  const agentMcpTools = new Set(mcpServerNames.flatMap(server => [`mcp__plugin_${pluginName}_${server}__`, `mcp__${server}__`])
    .flatMap(prefix => AGENT_MCP_TOOLS.map(tool => prefix + tool)));

  // Components.
  const components = { skills: [], agents: [] };
  const frontmatterOf = path => {
    const parsed = parseFrontmatter(texts.get(path));
    if (parsed.error) { fail(`${path}: ${parsed.error}`); return null; }
    return parsed.fields;
  };
  const text = value => (typeof value === 'string' ? value.trim() : '');
  const componentFiles = folder => files.map(file => file.path).filter(path => path.startsWith(`${folder}/`));
  for (const path of componentFiles('skills')) {
    const parts = path.split('/');
    if (parts.length < 3) { fail(`${path}: skills live in skills/<name>/SKILL.md`); continue; }
    if (parts.length !== 3 || parts[2] !== 'SKILL.md') continue; // supporting files inside a skill folder
    const folder = parts[1], fields = frontmatterOf(path);
    if (!fields) continue;
    if (!COMPONENT_NAME.test(folder)) fail(`${path}: folder name "${folder}" must match ${COMPONENT_NAME}`);
    if (text(fields.name) !== folder) fail(`${path}: frontmatter name "${text(fields.name)}" must equal its folder name "${folder}"`);
    if (!text(fields.description)) fail(`${path}: frontmatter description is required`);
    else if (text(fields.description).length > MAX_SKILL_DESCRIPTION) fail(`${path}: description is ${text(fields.description).length} characters; the limit is ${MAX_SKILL_DESCRIPTION}`);
    for (const key of SKILL_KEYS_NOT_ALLOWED) {
      if (Object.hasOwn(fields, key)) fail(`${path}: frontmatter ${key} is not allowed; the plugin pre-approves no tools, so every call goes through the normal permission prompt`);
    }
    components.skills.push(folder);
  }
  for (const folder of new Set(componentFiles('skills').map(path => path.split('/')[1]))) {
    if (componentFiles('skills').every(path => path !== `skills/${folder}/SKILL.md`) && componentFiles('skills').some(path => path.split('/').length >= 3 && path.split('/')[1] === folder)) {
      fail(`skills/${folder}/: missing SKILL.md`);
    }
  }
  const agentSkills = [];
  for (const path of componentFiles('agents')) {
    const fileName = path.slice('agents/'.length);
    if (fileName.includes('/') || extname(fileName) !== '.md') { fail(`${path}: agents must be agents/<name>.md files`); continue; }
    const fields = frontmatterOf(path);
    if (!fields) continue;
    for (const key of ['name', 'description']) if (!text(fields[key])) fail(`${path}: frontmatter ${key} is required`);
    const stem = fileName.slice(0, -'.md'.length);
    if (!COMPONENT_NAME.test(stem)) fail(`${path}: file name "${stem}" must match ${COMPONENT_NAME}`);
    if (text(fields.name) && text(fields.name) !== stem) fail(`${path}: frontmatter name "${text(fields.name)}" must equal its file name "${stem}"`);
    for (const key of AGENT_KEYS_NOT_ALLOWED) if (Object.hasOwn(fields, key)) fail(`${path}: frontmatter ${key} is not allowed in a read-only agent`);
    // The agent only reads: an explicit tool list (without one it inherits every tool), none of which writes or runs code.
    const tools = toolList(fields.tools);
    if (tools.length === 0) fail(`${path}: frontmatter tools is required (without it the agent inherits every tool, including writes)`);
    for (const tool of tools) {
      const base = tool.replace(/\(.*\)$/, '');
      if (tool.includes('*')) fail(`${path}: tool "${tool}" is a wildcard; list each read-only tool by name`);
      else if (WRITE_TOOLS.has(base)) fail(`${path}: tool "${tool}" writes files, runs commands or starts agents; the agent must stay read-only`);
      else if (base.startsWith('mcp__') && !agentMcpTools.has(base)) fail(`${path}: MCP tool "${tool}" is not allowed (allowed: ${[...agentMcpTools].join(', ') || 'none'})`);
    }
    if (fields.skills !== undefined) {
      if (!Array.isArray(fields.skills) || fields.skills.some(skill => !text(skill))) fail(`${path}: frontmatter skills must be a list of skill names`);
      else agentSkills.push(...fields.skills.map(skill => ({ path, skill: text(skill) })));
    }
    const name = text(fields.name) || stem;
    if (components.agents.includes(name)) fail(`${path}: agents name "${name}" is used twice`);
    components.agents.push(name);
  }
  for (const { path, skill } of agentSkills) {
    const bare = pluginName && skill.startsWith(`${pluginName}:`) ? skill.slice(pluginName.length + 1) : skill;
    if (!components.skills.includes(bare)) fail(`${path}: skill "${skill}" is not a skill in this plugin`);
  }

  // Secret scan and naming rules over every text file.
  for (const [path, content] of texts) {
    for (const { label, pattern, strict, hashContext } of SECRET_PATTERNS) {
      for (const hit of content.matchAll(pattern)) {
        const token = hit[1] ?? hit[0];
        const line = content.split('\n')[lineOf(content, hit.index) - 1];
        if (!strict && (PLACEHOLDER.test(token) || new Set(token.replace(/^(?:rb_(?:live|test)_|whsec_|0x)/, '')).size < 10)) continue;
        if (hashContext && HASH_CONTEXT.test(line)) continue;
        fail(`${path}:${lineOf(content, hit.index)}: looks like ${label}; use an obvious placeholder instead`);
      }
    }
    content.split('\n').forEach((line, index) => {
      const words = line.replace(/[`"'*_>]/g, ' ').replace(/^\s*(?:[-+]|\d+[.)])\s+/, '').trim().split(/\s+/);
      if (PHRASE_LENGTHS.has(words.length) && words.every(word => /^[a-z]{3,8}$/.test(word)) && new Set(words).size >= words.length - 1) {
        fail(`${path}:${index + 1}: looks like a wallet recovery phrase; never publish one, even as an example`);
      }
    });
    for (const { pattern, why } of [...PROSE_RULES, ...(PROSE_FILE.test(path) ? HOST_RULES : [])]) {
      for (const hit of content.matchAll(pattern)) fail(`${path}:${lineOf(content, hit.index)}: "${hit[0]}": ${why}`);
    }
  }

  return { errors, files, manifest, marketplace, components };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { errors, files, manifest, components } = validatePlugin(root);
  if (errors.length) {
    for (const error of errors) console.error(`FAIL ${error}`);
    console.error(`\nValidation failed with ${errors.length} error${errors.length === 1 ? '' : 's'}.`);
    process.exitCode = 1;
  } else {
    const counts = Object.entries(components).map(([kind, names]) => `${names.length} ${kind}`).join(', ');
    console.log(`PASS ${manifest.name} ${manifest.version}: ${files.length} files, ${counts}.`);
  }
}
