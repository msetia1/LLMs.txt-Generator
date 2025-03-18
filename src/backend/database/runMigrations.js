const fs = require('fs');
const path = require('path');
const supabase = require('../utils/supabaseClient');

/**
 * Run all migration files in the migrations directory
 */
async function runMigrations() {
  try {
    console.log('Running database migrations...');
    
    // Get all migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure migrations run in order
    
    if (migrationFiles.length === 0) {
      console.log('No migration files found');
      return;
    }
    
    // Run each migration
    for (const file of migrationFiles) {
      console.log(`Running migration: ${file}`);
      const migration = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      // Execute the SQL using Supabase's PostgreSQL interface
      const { error } = await supabase.rpc('pg_execute', { query: migration });
      
      if (error) {
        console.error(`Error running migration ${file}:`, error);
      } else {
        console.log(`Migration ${file} completed successfully`);
      }
    }
    
    console.log('All migrations completed');
  } catch (error) {
    console.error('Error running migrations:', error);
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations; 