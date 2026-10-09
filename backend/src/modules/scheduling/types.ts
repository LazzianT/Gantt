export type TaskType = "Summary" | "Normal" | "Milestone";
export type DependencyType = "FS" | "SS" | "FF" | "SF";
export type ConstraintType = "ASAP" | "SNET" | "FNLT"; // v1 subset

export interface Task {
  id: string;
  projectId: string;
  parentId: string | null;
  type: TaskType;
  name: string;
  durationDays: number;
  calendarId?: number | null;
  isManual: boolean;
  manualStart?: Date | null;
  manualFinish?: Date | null;
  constraint: { type: ConstraintType; date?: Date | null };
  order: number;
  percentComplete: number;
}

export interface Dependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
}

export interface ScheduleInput {
  projectStart: Date;
  tasks: Task[];
  dependencies: Dependency[];
}

export interface ComputedTask {
  id: string;
  es: Date;
  ef: Date;
  ls: Date;
  lf: Date;
  duration: number;
  percentComplete: number;
  totalFloat: number;
  freeFloat: number;
  isCritical: boolean;
  isViolatingConstraint: boolean;
}

export interface ScheduleResult {
  tasks: Map<string, ComputedTask>;
  projectFinish: Date;
  projectDuration: number;
  criticalPath: string[];
}
