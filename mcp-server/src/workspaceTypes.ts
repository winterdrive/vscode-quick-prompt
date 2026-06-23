import type { PromptManager } from '../../src/core/PromptManager.js';
import type { VersionManager } from '../../src/core/VersionManager.js';

export interface WorkspaceBinding {
  id: string;
  name: string;
  uri: string;
  rootPath: string;
  promptManager: PromptManager;
  versionManager: VersionManager;
}

export interface WorkspaceRefArgs {
  workspace?: string;
  workspaceId?: string;
  workspaceUri?: string;
}
