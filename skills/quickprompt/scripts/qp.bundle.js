#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// qp-entry.ts
var fs4 = __toESM(require("fs"));
var path4 = __toESM(require("path"));

// src/core/PromptManager.ts
var path2 = __toESM(require("path"));
var fs2 = __toESM(require("fs"));

// src/core/types.ts
var PROMPT_CONSTANTS = {
  USE_COUNT_THRESHOLD_HIGH: 10,
  USE_COUNT_THRESHOLD_MEDIUM: 5,
  PREVIEW_MAX_LENGTH: 200,
  AUTO_TITLE_MAX_LENGTH: 30,
  ID_PADDING_LENGTH: 3,
  MAX_VERSIONS: 15
};

// src/core/PathUtils.ts
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var PathUtils = class _PathUtils {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
  }
  /**
   * Validate that a path is within the workspace boundary.
   */
  validatePath(filePath) {
    const resolved = this.toAbsolutePath(filePath);
    const normalizedRoot = path.resolve(this.workspaceRoot);
    const normalizedPath = path.resolve(resolved);
    return normalizedPath.startsWith(normalizedRoot);
  }
  /**
   * Convert a relative path to an absolute path within the workspace.
   */
  toAbsolutePath(filePath) {
    if (path.isAbsolute(filePath)) {
      return path.resolve(filePath);
    }
    return path.resolve(this.workspaceRoot, filePath);
  }
  /**
   * Convert an absolute path to a workspace-relative path.
   */
  toRelativePath(absolutePath) {
    return path.relative(this.workspaceRoot, absolutePath);
  }
  /**
   * Ensure a directory exists (creates it recursively if needed).
   */
  static ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
  /**
   * Safely read a JSON file. Returns undefined if not found.
   */
  static readJsonFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return void 0;
      }
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return void 0;
    }
  }
  /**
   * Safely write a JSON file with pretty-printing.
   */
  static writeJsonFile(filePath, data) {
    const dir = path.dirname(filePath);
    _PathUtils.ensureDir(dir);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  }
  /**
   * Get the file modification time (for optimistic locking).
   */
  static getMtime(filePath) {
    try {
      const stat = fs.statSync(filePath);
      return stat.mtimeMs;
    } catch {
      return 0;
    }
  }
};

// src/core/PromptManager.ts
var OptimisticLockError = class extends Error {
  constructor(message = "File was modified by another process") {
    super(message);
    this.name = "OptimisticLockError";
  }
};
var PromptManager = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.cachedPrompts = null;
    this.cachedVersion = 0;
    this.promptsFilePath = path2.join(workspaceRoot, ".vscode", "prompts.json");
  }
  // ── Read ──────────────────────────────────────────────────────────────────
  /**
   * Load prompts from disk with version tracking.
   */
  loadPrompts() {
    if (!fs2.existsSync(this.promptsFilePath)) {
      return { prompts: [], version: 0 };
    }
    try {
      const content = fs2.readFileSync(this.promptsFilePath, "utf-8");
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        this.createBackup();
        return { prompts: [], version: 0 };
      }
      const prompts = parsed;
      const version = PathUtils.getMtime(this.promptsFilePath);
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const normalized = prompts.map((p) => ({
        id: p.id,
        title: p.title,
        content: p.content,
        use_count: p.use_count ?? 0,
        last_used: p.last_used || today,
        created_at: p.created_at || p.last_used || today,
        pinned: p.pinned ?? false,
        titleSource: p.titleSource,
        order: p.order,
        meta: p.meta
      }));
      this.cachedPrompts = structuredClone(normalized);
      this.cachedVersion = version;
      return { prompts: normalized, version };
    } catch (error) {
      this.createBackup();
      return { prompts: [], version: 0 };
    }
  }
  /**
   * Get prompts (from cache or disk).
   */
  getPrompts() {
    if (this.cachedPrompts) {
      return structuredClone(this.cachedPrompts);
    }
    return this.loadPrompts().prompts;
  }
  /**
   * Get a single prompt by ID.
   */
  getPrompt(promptId) {
    const prompts = this.getPrompts();
    return prompts.find((p) => p.id === promptId);
  }
  /**
   * Search prompts by keyword (searches title and content).
   */
  searchPrompts(query) {
    const prompts = this.getPrompts();
    const lower = query.toLowerCase();
    return prompts.filter(
      (p) => p.title.toLowerCase().includes(lower) || p.content.toLowerCase().includes(lower)
    );
  }
  // ── Write ─────────────────────────────────────────────────────────────────
  /**
   * Save prompts to disk with optimistic locking.
   */
  savePrompts(prompts, expectedVersion) {
    const currentVersion = PathUtils.getMtime(this.promptsFilePath);
    if (expectedVersion !== 0 && currentVersion !== 0 && currentVersion !== expectedVersion) {
      throw new OptimisticLockError();
    }
    PathUtils.writeJsonFile(this.promptsFilePath, prompts);
    const newVersion = PathUtils.getMtime(this.promptsFilePath);
    this.cachedPrompts = structuredClone(prompts);
    this.cachedVersion = newVersion;
    return newVersion;
  }
  /**
   * Create a new prompt. Returns the created prompt.
   */
  createPrompt(title, content, options) {
    const { prompts, version } = this.loadPrompts();
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const newId = this.generatePromptId(prompts);
    const newPrompt = {
      id: newId,
      title,
      content,
      use_count: 0,
      last_used: today,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      pinned: options?.pinned ?? false,
      titleSource: options?.titleSource,
      meta: { totalVersions: 0 }
    };
    prompts.push(newPrompt);
    this.savePrompts(prompts, version);
    return newPrompt;
  }
  /**
   * Edit prompt content and/or title.
   */
  editPrompt(promptId, updates) {
    const { prompts, version } = this.loadPrompts();
    const idx = prompts.findIndex((p) => p.id === promptId);
    if (idx === -1) {
      throw new Error(`Prompt not found: ${promptId}`);
    }
    if (updates.title !== void 0) {
      prompts[idx].title = updates.title;
    }
    if (updates.content !== void 0) {
      prompts[idx].content = updates.content;
    }
    this.savePrompts(prompts, version);
    return prompts[idx];
  }
  /**
   * Delete a prompt by ID.
   */
  deletePrompt(promptId) {
    const { prompts, version } = this.loadPrompts();
    const idx = prompts.findIndex((p) => p.id === promptId);
    if (idx === -1) {
      return false;
    }
    prompts.splice(idx, 1);
    this.savePrompts(prompts, version);
    return true;
  }
  /**
   * Toggle pin status.
   */
  togglePin(promptId) {
    const { prompts, version } = this.loadPrompts();
    const prompt = prompts.find((p) => p.id === promptId);
    if (!prompt) {
      throw new Error(`Prompt not found: ${promptId}`);
    }
    prompt.pinned = !prompt.pinned;
    this.savePrompts(prompts, version);
    return prompt;
  }
  /**
   * Move prompt up or down in the list.
   */
  movePrompt(promptId, direction) {
    const { prompts, version } = this.loadPrompts();
    const idx = prompts.findIndex((p) => p.id === promptId);
    if (idx === -1) {
      throw new Error(`Prompt not found: ${promptId}`);
    }
    if (direction === "up" && idx > 0) {
      [prompts[idx - 1], prompts[idx]] = [prompts[idx], prompts[idx - 1]];
    } else if (direction === "down" && idx < prompts.length - 1) {
      [prompts[idx], prompts[idx + 1]] = [prompts[idx + 1], prompts[idx]];
    } else {
      throw new Error(`Cannot move prompt ${direction}: already at boundary`);
    }
    prompts.forEach((p, i) => p.order = i);
    this.savePrompts(prompts, version);
    return prompts.find((p) => p.id === promptId);
  }
  /**
   * Increment use count (for copy/insert operations).
   */
  incrementUseCount(promptId) {
    const { prompts, version } = this.loadPrompts();
    const prompt = prompts.find((p) => p.id === promptId);
    if (!prompt) {
      throw new Error(`Prompt not found: ${promptId}`);
    }
    prompt.use_count++;
    prompt.last_used = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    this.savePrompts(prompts, version);
    return prompt;
  }
  /**
   * Update prompt metadata (called by version manager).
   */
  updateMeta(promptId, meta) {
    const { prompts, version } = this.loadPrompts();
    const prompt = prompts.find((p) => p.id === promptId);
    if (prompt) {
      prompt.meta = meta;
      this.savePrompts(prompts, version);
    }
  }
  // ── Helpers ───────────────────────────────────────────────────────────────
  /**
   * Clear the in-memory cache.
   */
  clearCache() {
    this.cachedPrompts = null;
    this.cachedVersion = 0;
  }
  generatePromptId(existingPrompts) {
    const maxId = Math.max(0, ...existingPrompts.map((p) => parseInt(p.id) || 0));
    return (maxId + 1).toString().padStart(PROMPT_CONSTANTS.ID_PADDING_LENGTH, "0");
  }
  createBackup() {
    try {
      if (fs2.existsSync(this.promptsFilePath)) {
        const backupPath = `${this.promptsFilePath}.backup.${Date.now()}`;
        fs2.copyFileSync(this.promptsFilePath, backupPath);
        console.error(`[PromptManager] Created backup: ${backupPath}`);
      }
    } catch {
    }
  }
};

// src/core/VersionManager.ts
var path3 = __toESM(require("path"));
var fs3 = __toESM(require("fs"));
var VersionManager = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.cache = /* @__PURE__ */ new Map();
    this.historyDir = path3.join(workspaceRoot, ".vscode", ".quickprompt", "history");
  }
  // ── Read ──────────────────────────────────────────────────────────────────
  /**
   * Load version history for a specific prompt.
   */
  loadHistory(promptId) {
    const historyPath = this.getHistoryPath(promptId);
    let currentMtime = 0;
    try {
      const stats = fs3.statSync(historyPath);
      currentMtime = stats.mtimeMs;
    } catch {
    }
    if (this.cache.has(promptId)) {
      const cached = this.cache.get(promptId);
      if (cached.mtimeMs === currentMtime) {
        return JSON.parse(JSON.stringify(cached.history));
      }
    }
    if (currentMtime === 0) {
      const emptyHistory = {
        promptId,
        versions: [],
        currentVersionId: ""
      };
      this.cache.set(promptId, { history: emptyHistory, mtimeMs: 0 });
      return { ...emptyHistory, versions: [] };
    }
    try {
      const content = fs3.readFileSync(historyPath, "utf-8");
      const history = JSON.parse(content);
      this.cache.set(promptId, { history, mtimeMs: currentMtime });
      return JSON.parse(JSON.stringify(history));
    } catch {
      const emptyHistory = {
        promptId,
        versions: [],
        currentVersionId: ""
      };
      return emptyHistory;
    }
  }
  /**
   * Get version content by ID.
   */
  getVersionContent(promptId, versionId) {
    const history = this.loadHistory(promptId);
    const version = history.versions.find((v) => v.versionId === versionId);
    if (!version) {
      throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
    }
    return version.content;
  }
  /**
   * Get current version.
   */
  getCurrentVersion(promptId) {
    const history = this.loadHistory(promptId);
    return history.versions.find((v) => v.versionId === history.currentVersionId);
  }
  /**
   * List all versions for a prompt.
   */
  listVersions(promptId) {
    const history = this.loadHistory(promptId);
    return {
      versions: history.versions,
      currentVersionId: history.currentVersionId
    };
  }
  // ── Write ─────────────────────────────────────────────────────────────────
  /**
   * Save version history to disk.
   */
  saveHistory(history) {
    const historyPath = this.getHistoryPath(history.promptId);
    PathUtils.writeJsonFile(historyPath, history);
    let mtimeMs = 0;
    try {
      mtimeMs = fs3.statSync(historyPath).mtimeMs;
    } catch {
      mtimeMs = Date.now();
    }
    this.cache.set(history.promptId, {
      history: JSON.parse(JSON.stringify(history)),
      mtimeMs
    });
  }
  /**
   * Create a new version. Returns the created version.
   * Smart deduplication: skips if content matches head.
   */
  createVersion(promptId, options) {
    const history = this.loadHistory(promptId);
    if (history.currentVersionId) {
      const currentVersion = history.versions.find((v) => v.versionId === history.currentVersionId);
      if (currentVersion && currentVersion.content === options.content) {
        return currentVersion;
      }
    }
    const versionId = this.generateVersionId();
    const newVersion = {
      versionId,
      content: options.content,
      timestamp: Date.now(),
      changeType: options.changeType
    };
    if (options.milestoneLabel) {
      newVersion.milestone = {
        label: options.milestoneLabel,
        createdAt: Date.now()
      };
    }
    history.versions.unshift(newVersion);
    history.currentVersionId = versionId;
    if (options.changeType !== "restore") {
      this.pruneVersions(history);
    }
    this.saveHistory(history);
    return newVersion;
  }
  /**
   * Apply (restore) a historical version.
   * Creates a new version with changeType: 'restore'.
   */
  applyVersion(promptId, versionId) {
    const history = this.loadHistory(promptId);
    const versionToRestore = history.versions.find((v) => v.versionId === versionId);
    if (!versionToRestore) {
      throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
    }
    return this.createVersion(promptId, {
      content: versionToRestore.content,
      changeType: "restore"
    });
  }
  /**
   * Delete a specific version.
   * Protection: cannot delete current version or the only version.
   */
  deleteVersion(promptId, versionId) {
    const history = this.loadHistory(promptId);
    if (history.currentVersionId === versionId) {
      throw new Error("Cannot delete the current version");
    }
    if (history.versions.length <= 1) {
      throw new Error("Cannot delete the only version");
    }
    const idx = history.versions.findIndex((v) => v.versionId === versionId);
    if (idx === -1) {
      throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
    }
    history.versions.splice(idx, 1);
    this.saveHistory(history);
  }
  // ── Milestones ────────────────────────────────────────────────────────────
  /**
   * Tag a version as a milestone.
   */
  tagMilestone(promptId, versionId, label) {
    const history = this.loadHistory(promptId);
    const version = history.versions.find((v) => v.versionId === versionId);
    if (!version) {
      throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
    }
    version.milestone = { label, createdAt: Date.now() };
    this.saveHistory(history);
  }
  /**
   * Rename a milestone.
   */
  renameMilestone(promptId, versionId, newLabel) {
    const history = this.loadHistory(promptId);
    const version = history.versions.find((v) => v.versionId === versionId);
    if (!version) {
      throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
    }
    if (!version.milestone) {
      throw new Error(`Version ${versionId} is not a milestone`);
    }
    version.milestone.label = newLabel;
    this.saveHistory(history);
  }
  /**
   * Remove milestone tag (keeps the version).
   */
  removeMilestone(promptId, versionId) {
    const history = this.loadHistory(promptId);
    const version = history.versions.find((v) => v.versionId === versionId);
    if (!version) {
      throw new Error(`Version ${versionId} not found for prompt ${promptId}`);
    }
    delete version.milestone;
    this.saveHistory(history);
  }
  // ── Cache ─────────────────────────────────────────────────────────────────
  clearCache(promptId) {
    if (promptId) {
      this.cache.delete(promptId);
    } else {
      this.cache.clear();
    }
  }
  /**
   * Delete all version history for a prompt.
   */
  deleteHistory(promptId) {
    const historyPath = this.getHistoryPath(promptId);
    try {
      if (fs3.existsSync(historyPath)) {
        fs3.unlinkSync(historyPath);
      }
    } catch {
    }
    this.cache.delete(promptId);
  }
  // ── Helpers ───────────────────────────────────────────────────────────────
  getHistoryPath(promptId) {
    if (promptId.includes("..") || promptId.includes("/") || promptId.includes("\\")) {
      throw new Error(`Invalid promptId: ${promptId}`);
    }
    const safeId = path3.basename(promptId);
    return path3.join(this.historyDir, `${safeId}.history.json`);
  }
  generateVersionId() {
    return `v${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
  pruneVersions(history) {
    while (history.versions.length > PROMPT_CONSTANTS.MAX_VERSIONS) {
      let indexToRemove = -1;
      for (let i = history.versions.length - 1; i >= 0; i--) {
        const v = history.versions[i];
        if (!v.milestone && v.versionId !== history.currentVersionId) {
          indexToRemove = i;
          break;
        }
      }
      if (indexToRemove !== -1) {
        history.versions.splice(indexToRemove, 1);
      } else {
        break;
      }
    }
  }
};

// qp-entry.ts
function findWorkspaceRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs4.existsSync(path4.join(dir, ".vscode"))) return dir;
    const parent = path4.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
function parseArgs(argv) {
  const [, , command2 = "", ...rest] = argv;
  const flags2 = {};
  const positional2 = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) {
      const key = rest[i].slice(2);
      const val = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : "true";
      flags2[key] = val;
    } else {
      positional2.push(rest[i]);
    }
  }
  return { command: command2, flags: flags2, positional: positional2 };
}
var { command, flags, positional } = parseArgs(process.argv);
var root = findWorkspaceRoot();
var pm = new PromptManager(root);
var vm = new VersionManager(root);
switch (command) {
  case "list-prompts": {
    const prompts = pm.getPrompts();
    if (prompts.length === 0) {
      console.log("(no prompts)");
      break;
    }
    prompts.forEach((p) => {
      console.log(`[${p.id}] ${p.title} - used ${p.use_count} times`);
    });
    break;
  }
  case "get-prompt": {
    const id = positional[0];
    if (!id) {
      console.error("Error: please provide an ID, e.g., get-prompt 001");
      process.exit(1);
    }
    const prompt = pm.getPrompt(id);
    if (!prompt) {
      console.error(`Error: prompt "${id}" not found`);
      process.exit(1);
    }
    console.log(`Title: ${prompt.title}`);
    console.log(`Last Used: ${prompt.last_used}`);
    console.log(`---\\n${prompt.content}\\n---`);
    break;
  }
  case "add-prompt": {
    const title = flags["title"];
    const content = flags["content"];
    if (!title || !content) {
      console.error("Error: please provide --title <title> and --content <content>");
      process.exit(1);
    }
    const newPrompt = pm.createPrompt(title, content);
    console.log(`Prompt added: ${title} (id=${newPrompt.id})`);
    break;
  }
  case "edit-prompt": {
    const id = positional[0];
    if (!id) {
      console.error("Error: please provide an ID, e.g., edit-prompt 001");
      process.exit(1);
    }
    const title = flags["title"];
    const content = flags["content"];
    if (!title && !content) {
      console.error("Error: please provide --title <title> or --content <content>");
      process.exit(1);
    }
    try {
      pm.editPrompt(id, { title, content });
      console.log(`Prompt edited: (id=${id})`);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    break;
  }
  case "remove-prompt": {
    const id = positional[0];
    if (!id) {
      console.error("Error: please provide an ID, e.g., remove-prompt 001");
      process.exit(1);
    }
    const success = pm.deletePrompt(id);
    if (success) {
      console.log(`Prompt removed: ${id}`);
    } else {
      console.error(`Error: prompt "${id}" not found`);
      process.exit(1);
    }
    break;
  }
  // ──────────────────────────────────────────────
  // Version history commands
  // ──────────────────────────────────────────────
  case "list-versions": {
    const promptId = flags["id"] || positional[0];
    if (!promptId) {
      console.error("Error: please provide --id <promptId>, e.g., list-versions --id 002");
      process.exit(1);
    }
    try {
      const { versions, currentVersionId } = vm.listVersions(promptId);
      if (versions.length === 0) {
        console.log(`(no versions for prompt ${promptId})`);
        break;
      }
      versions.forEach((v) => {
        const isCurrent = v.versionId === currentVersionId ? "*" : " ";
        const milestoneLabel = v.milestone ? ` [milestone: ${v.milestone.label}]` : "";
        const ts = new Date(v.timestamp).toISOString();
        console.log(`${isCurrent} ${v.versionId}  (${v.changeType} @ ${ts})${milestoneLabel}`);
      });
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    break;
  }
  case "show-version": {
    const promptId = flags["id"] || positional[0];
    const versionId = flags["version"] || positional[1];
    if (!promptId || !versionId) {
      console.error("Error: usage: show-version --id <promptId> --version <versionId>");
      process.exit(1);
    }
    try {
      const content = vm.getVersionContent(promptId, versionId);
      console.log(content);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    break;
  }
  case "show-current": {
    const promptId = flags["id"] || positional[0];
    if (!promptId) {
      console.error("Error: please provide --id <promptId>, e.g., show-current --id 002");
      process.exit(1);
    }
    try {
      const current = vm.getCurrentVersion(promptId);
      if (!current) {
        console.log(`(no current version for prompt ${promptId})`);
        break;
      }
      console.log(current.content);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    break;
  }
  case "apply-version": {
    const promptId = flags["id"] || positional[0];
    const versionId = flags["version"] || positional[1];
    if (!promptId || !versionId) {
      console.error("Error: usage: apply-version --id <promptId> --version <versionId>");
      process.exit(1);
    }
    try {
      const newVersion = vm.applyVersion(promptId, versionId);
      console.log(`Applied version ${versionId} as new version ${newVersion.versionId}`);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    break;
  }
  case "delete-version": {
    const promptId = flags["id"] || positional[0];
    const versionId = flags["version"] || positional[1];
    if (!promptId || !versionId) {
      console.error("Error: usage: delete-version --id <promptId> --version <versionId>");
      process.exit(1);
    }
    try {
      vm.deleteVersion(promptId, versionId);
      console.log(`Deleted version ${versionId} for prompt ${promptId}`);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    break;
  }
  case "tag-milestone": {
    const promptId = flags["id"] || positional[0];
    const versionId = flags["version"] || positional[1];
    const label = flags["label"] || positional[2];
    if (!promptId || !versionId || !label) {
      console.error('Error: usage: tag-milestone --id <promptId> --version <versionId> --label "<label>"');
      process.exit(1);
    }
    try {
      vm.tagMilestone(promptId, versionId, label);
      console.log(`Tagged version ${versionId} as milestone "${label}" for prompt ${promptId}`);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    break;
  }
  case "remove-milestone": {
    const promptId = flags["id"] || positional[0];
    const versionId = flags["version"] || positional[1];
    if (!promptId || !versionId) {
      console.error("Error: usage: remove-milestone --id <promptId> --version <versionId>");
      process.exit(1);
    }
    try {
      vm.removeMilestone(promptId, versionId);
      console.log(`Removed milestone from version ${versionId} for prompt ${promptId}`);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    break;
  }
  default: {
    console.log(`
QuickPrompt CLI (qp)

Usage:
  node qp.bundle.js list-prompts
  node qp.bundle.js get-prompt <id>
  node qp.bundle.js add-prompt --title <title> --content <content>
  node qp.bundle.js edit-prompt <id> [--title <title>] [--content <content>]
  node qp.bundle.js remove-prompt <id>

  # Version history commands
  node qp.bundle.js list-versions --id <promptId>
  node qp.bundle.js show-version --id <promptId> --version <versionId>
  node qp.bundle.js show-current --id <promptId>
  node qp.bundle.js apply-version --id <promptId> --version <versionId>
  node qp.bundle.js delete-version --id <promptId> --version <versionId>
  node qp.bundle.js tag-milestone --id <promptId> --version <versionId> --label "<label>"
  node qp.bundle.js remove-milestone --id <promptId> --version <versionId>
        `.trim());
    break;
  }
}
