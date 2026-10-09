import { HrisEmployeeAdapter, type QueryFn } from "./hris-adapter.js";
import type { EmployeeProvider } from "./provider.js";

export function createEmployeeProvider(queryFn: QueryFn): EmployeeProvider {
  return new HrisEmployeeAdapter(queryFn);
}

export { HrisEmployeeAdapter };
export type { QueryFn } from "./hris-adapter.js";
export type { EmployeeDTO, EmployeeProvider, EmployeeStatus, Gender } from "./provider.js";
