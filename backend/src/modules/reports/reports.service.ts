import { NotFoundError } from "../../middleware/error.js";
import { getReports, type Exec, type ReportsData } from "./reports.repository.js";

export type { Exec, ReportsData } from "./reports.repository.js";

export async function projectReports(exec: Exec, projectId: number): Promise<ReportsData> {
  const data = await getReports(exec, projectId);
  if (!data) throw new NotFoundError("Project not found");
  return data;
}