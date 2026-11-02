import pg from 'pg';

// One shared connection pool for the whole app. pg reads the connection
// string from DATABASE_URL; queries borrow a connection and return it.
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Run a parameterized query ($1, $2, ...) and return the rows.
// Values are always passed separately from the SQL text, so user input
// can never change the query itself (no SQL injection).
export async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}
