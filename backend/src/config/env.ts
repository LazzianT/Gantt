import "dotenv/config";

const DEV_JWT_SECRET = "dev-insecure-secret";

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

function readInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Expected integer env value, received "${value}"`);
  }
  return parsed;
}

function readString(value: string | undefined, fallback: string): string {
  return value === undefined || value === "" ? fallback : value;
}

function readList(value: string | undefined): string[] {
  if (value === undefined || value === "") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Canonicalizes a department id to the zero-padded 4-character code used for
 * authorization (HRIS DepartID "0800" and numeric 800 both map to "0800").
 */
export function normalizeDepartCode(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === "") return null;
  return /^\d+$/.test(text) ? text.padStart(4, "0") : text;
}

function readDepartCodes(value: string | undefined): string[] {
  const codes = readList(value)
    .map((item) => normalizeDepartCode(item))
    .filter((item): item is string => item !== null);
  return Array.from(new Set(codes));
}

export function readEnv(source: NodeJS.ProcessEnv = process.env) {
  const nodeEnv = source.NODE_ENV ?? "";
  const isDev = nodeEnv === "development";

  const configuredSecret = source.JWT_SECRET ?? "";
  if (configuredSecret === DEV_JWT_SECRET) {
    throw new Error(`JWT_SECRET must not be the development default "${DEV_JWT_SECRET}".`);
  }
  const jwtSecret = configuredSecret === "" ? (isDev ? DEV_JWT_SECRET : "") : configuredSecret;

  const db = {
    server: readString(source.DB_SERVER, ""),
    port: readInt(source.DB_PORT, 1433),
    database: readString(source.DB_DATABASE, "CORP_DB"),
    user: readString(source.DB_USER, ""),
    password: readString(source.DB_PASSWORD, ""),
    encrypt: readBool(source.DB_ENCRYPT, false),
    trustServerCertificate: readBool(source.DB_TRUST_SERVER_CERTIFICATE, true),
    poolMax: readInt(source.DB_POOL_MAX, 10),
    poolMin: readInt(source.DB_POOL_MIN, 0),
    queryTimeoutMs: readInt(source.DB_QUERY_TIMEOUT_MS, 5000),
  };

  // Fail closed outside development: require a real secret and DB credentials.
  if (!isDev) {
    const missing: string[] = [];
    if (!jwtSecret) missing.push("JWT_SECRET");
    if (!db.server) missing.push("DB_SERVER");
    if (!db.user) missing.push("DB_USER");
    if (!db.password) missing.push("DB_PASSWORD");
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables (NODE_ENV="${nodeEnv}" is not "development"): ${missing.join(", ")}`,
      );
    }
  }

  return {
    nodeEnv,
    isDev,
    port: readInt(source.PORT, 4000),
    corsOrigin: readString(source.CORS_ORIGIN, "*"),
    db,
    jwt: {
      secret: jwtSecret,
      expiresIn: readString(source.JWT_EXPIRES_IN, "8h"),
    },
    employee: {
      cacheTtlSeconds: readInt(source.EMPLOYEE_CACHE_TTL_SECONDS, 300),
    },
    auth: {
      adminNips: readList(source.AUTH_ADMIN_NIPS),
      managerNips: readList(source.AUTH_MANAGER_NIPS),
      // Departments allowed to create/edit/delete projects (zero-padded codes).
      projectDepartments: readDepartCodes(source.AUTH_PROJECT_DEPARTMENTS ?? "0800,0700,0200"),
    },
  };
}

export const env = readEnv();
