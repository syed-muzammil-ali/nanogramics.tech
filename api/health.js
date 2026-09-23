import {errorResponse, getPool} from './_db.js';

export async function GET() {
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  if (!databaseConfigured) {
    return Response.json({ok: true, databaseConfigured, databaseConnected: false});
  }

  try {
    const db = await getPool();
    await db.query('SELECT 1');
    return Response.json({ok: true, databaseConfigured, databaseConnected: true});
  } catch (error) {
    return errorResponse(error);
  }
}
