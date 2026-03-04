import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('DB not initialized')
  return db
}

export function initDb(): void {
  const baseDir = app.getPath('userData')
  const dbDir = join(baseDir, 'db')
  mkdirSync(dbDir, { recursive: true })

  const dbPath = join(dbDir, 'app.sqlite')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  // Minimum şema (başlangıç)
  db.exec(`
    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder_path TEXT,
      cloud_contract_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_items (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      local_path TEXT NOT NULL,
      sha256 TEXT,
      width INTEGER,
      height INTEGER,
      status TEXT NOT NULL DEFAULT 'in_progress',
      cloud_task_id TEXT,
      cloud_asset_url TEXT,
      sync_status TEXT NOT NULL DEFAULT 'synced',
      created_at INTEGER NOT NULL,
      updated_at INTEGER,
      FOREIGN KEY(dataset_id) REFERENCES datasets(id)
    );

    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL,
      type TEXT NOT NULL,          -- bbox | polygon | keypoint | ...
      category TEXT,               -- şimdilik string, sonra categories tablosu eklenir
      data_json TEXT NOT NULL,     -- JSON string
      updated_at INTEGER NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending_insert',
      FOREIGN KEY(media_id) REFERENCES media_items(id)
    );

    CREATE INDEX IF NOT EXISTS idx_media_dataset ON media_items(dataset_id);
    CREATE INDEX IF NOT EXISTS idx_ann_media ON annotations(media_id);

    CREATE TABLE IF NOT EXISTS task_leases (
      task_id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      lease_token TEXT NOT NULL,
      leased_until INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_task_leases_contract ON task_leases(contract_id);
    CREATE INDEX IF NOT EXISTS idx_task_leases_until ON task_leases(leased_until);
  `)
  // --- Lightweight migrations (kolon ekleme) ---
  migrateDatasets()
  migrateMediaItems()
  migrateAnnotations()
}

function hasColumn(table: string, col: string): boolean {
  const rows = getDb().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return rows.some((r) => r.name === col)
}

function migrateMediaItems(): void {
  const db = getDb()
  // Eski DB'lerde status/updated_at yoksa ekle
  if (!hasColumn('media_items', 'status')) {
    db.exec(`ALTER TABLE media_items ADD COLUMN status TEXT NOT NULL DEFAULT 'in_progress';`)
  }
  if (!hasColumn('media_items', 'updated_at')) {
    db.exec(`ALTER TABLE media_items ADD COLUMN updated_at INTEGER;`)
  }
  // Her media için etiketleme süresi (saniye cinsinden)
  if (!hasColumn('media_items', 'annotation_seconds')) {
    db.exec(`ALTER TABLE media_items ADD COLUMN annotation_seconds INTEGER NOT NULL DEFAULT 0;`)
  }
  // Bulut senkronizasyon kolonları
  if (!hasColumn('media_items', 'cloud_task_id')) {
    db.exec(`ALTER TABLE media_items ADD COLUMN cloud_task_id TEXT;`)
  }
  if (!hasColumn('media_items', 'cloud_asset_url')) {
    db.exec(`ALTER TABLE media_items ADD COLUMN cloud_asset_url TEXT;`)
  }
  if (!hasColumn('media_items', 'sync_status')) {
    db.exec(`ALTER TABLE media_items ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'synced';`)
  }
  if (!hasColumn('media_items', 'cloud_asset_id')) {
    db.exec(`ALTER TABLE media_items ADD COLUMN cloud_asset_id TEXT;`)
  }
  if (!hasColumn('media_items', 'contract_id')) {
    db.exec(`ALTER TABLE media_items ADD COLUMN contract_id TEXT;`)
  }
  if (!hasColumn('media_items', 'download_status')) {
    db.exec(`ALTER TABLE media_items ADD COLUMN download_status TEXT NOT NULL DEFAULT 'ok';`)
  }
  if (!hasColumn('media_items', 'last_error')) {
    db.exec(`ALTER TABLE media_items ADD COLUMN last_error TEXT;`)
  }
  // Var olan satırlarda NULL kalmışsa normalize et
  db.prepare(`UPDATE media_items SET status='in_progress' WHERE status IS NULL`).run()
  // Unique index on cloud_task_id (partial: where not null)
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_media_cloud_task ON media_items(cloud_task_id) WHERE cloud_task_id IS NOT NULL;`
  )
}
function migrateDatasets(): void {
  const db = getDb()
  if (!hasColumn('datasets', 'folder_path')) {
    db.exec(`ALTER TABLE datasets ADD COLUMN folder_path TEXT;`)
  }
  if (!hasColumn('datasets', 'cloud_contract_id')) {
    db.exec(`ALTER TABLE datasets ADD COLUMN cloud_contract_id TEXT;`)
  }
  // folder_path kolonu garanti olduktan sonra index güvenle oluşturulur
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_datasets_folder_path ON datasets(folder_path);`)
}

function migrateAnnotations(): void {
  const db = getDb()
  if (!hasColumn('annotations', 'sync_status')) {
    db.exec(
      `ALTER TABLE annotations ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending_insert';`
    )
  }
  if (!hasColumn('annotations', 'cloud_task_id')) {
    db.exec(`ALTER TABLE annotations ADD COLUMN cloud_task_id TEXT;`)
  }
  if (!hasColumn('annotations', 'contract_id')) {
    db.exec(`ALTER TABLE annotations ADD COLUMN contract_id TEXT;`)
  }
  if (!hasColumn('annotations', 'payload_json')) {
    db.exec(`ALTER TABLE annotations ADD COLUMN payload_json TEXT;`)
  }
  if (!hasColumn('annotations', 'last_error')) {
    db.exec(`ALTER TABLE annotations ADD COLUMN last_error TEXT;`)
  }
  if (!hasColumn('annotations', 'attempt_count')) {
    db.exec(`ALTER TABLE annotations ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;`)
  }
  if (!hasColumn('annotations', 'payload_hash')) {
    db.exec(`ALTER TABLE annotations ADD COLUMN payload_hash TEXT;`)
  }
  if (!hasColumn('annotations', 'last_synced_hash')) {
    db.exec(`ALTER TABLE annotations ADD COLUMN last_synced_hash TEXT;`)
  }
}
