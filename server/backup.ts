// SQLite backups are disabled — the app now uses Postgres (managed by Render).
export function performBackup(_dbPath: string): string {
  console.log("[Backup] SQLite backups disabled (using Postgres)");
  return "";
}

export function scheduleBackups(_dbPath?: string, _intervalHours?: number): void {
  console.log("[Backup] SQLite backups disabled (using Postgres)");
}
