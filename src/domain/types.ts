export type CapabilityKind = 'skill' | 'connector';
export type SkillStage = 'prepare' | 'design' | 'create' | 'edit' | 'check' | 'error' | 'export' | 'publish';
export type MaintenanceStatus = 'active' | 'stale' | 'deprecated' | 'removed' | 'unavailable';
export type TaskCategory = 'video' | 'spreadsheet' | 'presentation' | 'website' | 'image' | 'pdf' | 'document' | 'email' | 'calendar' | 'research' | 'design' | 'other';
export interface Skill {
  id: string; name: string; chineseName: string; pluginId: string;
  description: string; skillMarkdown: string; simpleDescription: string;
  category: string; tags: string[]; userPhrases: string[]; taskTypes: TaskCategory[];
  stage: SkillStage; required: boolean; conditions: string[]; excludeConditions: string[];
  prerequisites: string[]; nextSkills: string[]; githubUrl: string;
  sourceType: 'system' | 'github' | 'import'; version: string; updatedAt: string;
  maintenanceStatus: MaintenanceStatus; capabilityKind: CapabilityKind;
  sourcePath: string; contentHash: string; interpretationStatus: 'ready' | 'pending' | 'failed';
}
export type Requirement = 'required' | 'excluded' | 'unspecified';
export interface TaskIntent {
  category: TaskCategory; goals: string[]; existingMaterials: string[]; missingMaterials: string[];
  completedActions: string[]; requirements: Record<string, Requirement>;
  parameters: Record<string, string>; subtype: string; hasExistingOutput: boolean;
  hasDesign: boolean; hasError: boolean; useCloud: boolean;
}
export interface WorkflowStep {
  id: string; action: string; title: string; description: string; skillId: string | null;
  skillName: string; capabilityKind: CapabilityKind; stage: SkillStage;
  status: 'pending' | 'completed' | 'skipped'; optional: boolean; dependencies: string[];
}
export interface TaskRecord {
  id: string; title: string; originalInput: string; inputs: string[]; intent: TaskIntent;
  steps: WorkflowStep[]; createdAt: string; updatedAt: string;
  status: 'planned' | 'started' | 'completed'; mode: 'local' | 'codex'; favorite: boolean;
}
export interface Clarification { question: string; options: string[]; originalInput: string; }
export type InterpretationResult = { kind: 'clarification'; clarification: Clarification } | { kind: 'task'; task: TaskRecord; notice?: string };
export interface Source {
  id: string; url: string; owner: string; repo: string; name: string; kind: 'repository' | 'author';
  stars?: number;
  enabled: boolean; status: 'idle' | 'scanning' | 'complete' | 'partial' | 'error';
  lastCheckedAt: string | null; lastSuccessAt: string | null; skillCount: number;
  error: string | null; cursor: string | null; snapshotSha: string | null;
}
export interface ScanJob {
  id: string; sourceId: string; kind: 'scan' | 'interpret'; status: 'queued' | 'running' | 'completed' | 'failed' | 'paused';
  message: string; processed: number; total: number; createdAt: string; updatedAt: string;
}
export interface BridgeStatus {
  connected: boolean; codexAvailable: boolean; authMode: 'chatgpt' | 'api-key' | 'none';
  message: string; backgroundEnabled: boolean; interpretedToday: number;
}
export interface AppSettings {
  preferAI: boolean; automaticChecks: boolean; bridgeUrl: string; publicCatalogUrl: string;
}
export interface AppData {
  schemaVersion: 1; tasks: TaskRecord[]; skills: Skill[]; favoriteSkillIds: string[];
  settings: AppSettings;
}
