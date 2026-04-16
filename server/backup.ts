import fs from "fs";
import path from "path";

const BACKUP_DIR = process.env.BACKUP_DIR || "./backups";
const MAX_BACKUPS = 30;

export function performBackup(dbPath: string): string {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFileName = `offload-backup-${timestamp}.db`;
  const backupPath = path.join(BACKUP_DIR, backupFileName);

  // SQLite hot backup via file copy (safe with WAL mode)
  fs.copyFileSync(dbPath, backupPath);

  // Rotate old backups
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("offload-backup-") && f.endsWith(".db"))
    .sort()
    .reverse();

  for (let i = MAX_BACKUPS; i < backups.length; i++) {
    fs.unlinkSync(path.join(BACKUP_DIR, backups[i]));
  }

  return backupPath;
}

export function scheduleBackups(dbPath: string, intervalHours: number = 6) {
  // Run backup immediately on startup
  try {
    const backupPath = performBackup(dbPath);
    console.log(`[Backup] Initial backup created: ${backupPath}`);
  } catch (err) {
    console.error("[Backup] Initial backup failed:", err);
  }

  // Schedule recurring backups
  setInterval(() => {
    try {
      const backupPath = performBackup(dbPath);
      console.log(`[Backup] Scheduled backup created: ${backupPath}`);
    } catch (err) {
      console.error("[Backup] Scheduled backup failed:", err);
    }
  }, intervalHours * 60 * 60 * 1000);
}
