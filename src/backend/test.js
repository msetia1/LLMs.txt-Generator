require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testConnection() {
  console.log('Testing direct connection...');
  try {
    const { data, error } = await supabase
      .from('llms_generations')
      .select('*', { count: 'exact' })
      .limit(1);
    
    if (error) {
      console.error('Database error:', error);
    } else {
      console.log('Connection successful:', data);
    }
  } catch (err) {
    console.error('Connection exception:', err);
  }
}

testConnection();