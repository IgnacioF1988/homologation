const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Import connection pool
const { getPool } = require('./config/database.js');

async function runMigration(migrationFile) {
    try {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Executing migration: ${path.basename(migrationFile)}`);
        console.log('='.repeat(60));

        const pool = await getPool();
        const migrationSQL = fs.readFileSync(migrationFile, 'utf8');

        // Split by GO statements (batch separator in SQL Server)
        const batches = migrationSQL
            .split(/^\s*GO\s*$/gim)
            .map(batch => batch.trim())
            .filter(batch => batch.length > 0);

        console.log(`\nFound ${batches.length} batch(es) to execute\n`);

        // Execute each batch sequentially
        for (let i = 0; i < batches.length; i++) {
            try {
                console.log(`Executing batch ${i + 1}/${batches.length}...`);
                await pool.request().batch(batches[i]);
                console.log(`  ✓ Batch ${i + 1} completed`);
            } catch (batchError) {
                console.error(`  ✗ Batch ${i + 1} failed:`, batchError.message);
                // Continue with other batches for PRINT statements and warnings
                if (batchError.class >= 16) {
                    throw batchError; // Re-throw critical errors
                }
            }
        }

        console.log('\n✓ Migration completed successfully');
        console.log('='.repeat(60));

        process.exit(0);
    } catch (error) {
        console.error('\n✗ Migration failed:', error.message);
        console.error('\nFull error:', error);
        console.log('='.repeat(60));
        process.exit(1);
    }
}

// Get migration file from command line argument
const migrationFile = process.argv[2];

if (!migrationFile) {
    console.error('Usage: node run_migration.js <migration_file_path>');
    process.exit(1);
}

if (!fs.existsSync(migrationFile)) {
    console.error(`Migration file not found: ${migrationFile}`);
    process.exit(1);
}

runMigration(migrationFile);
