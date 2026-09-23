import {errorResponse, getPool} from './_db.js';

const services = new Set([
  'SaaS development',
  'POS system development',
  'ERP system development',
  'Website development',
  'Social media content',
  'Graphic design'
]);

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validateInquiry(input) {
  const inquiry = {
    name: cleanText(input.name, 100),
    email: cleanText(input.email, 160).toLowerCase(),
    service: cleanText(input.service, 80),
    meetingDate: cleanText(input.meetingDate, 20),
    brief: cleanText(input.brief, 1200)
  };
  const errors = [];
  if (!inquiry.name) errors.push('Name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.email)) errors.push('A valid email is required.');
  if (!services.has(inquiry.service)) errors.push('Please choose a valid service.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inquiry.meetingDate)) errors.push('Meeting date is required.');
  if (!inquiry.brief) errors.push('Small message is required.');
  return {inquiry, errors};
}

export async function POST(request) {
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 16_384) {
      return Response.json({ok: false, error: 'Request body is too large.'}, {status: 413});
    }

    const {inquiry, errors} = validateInquiry(await request.json());
    if (errors.length) {
      return Response.json({ok: false, errors}, {status: 422});
    }

    const db = await getPool();
    const result = await db.query(
      `INSERT INTO project_inquiries (name, email, service, meeting_date, brief)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [inquiry.name, inquiry.email, inquiry.service, inquiry.meetingDate, inquiry.brief]
    );
    return Response.json(
      {ok: true, inquiryId: result.rows[0].id, createdAt: result.rows[0].created_at},
      {status: 201}
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ok: false, error: 'Request body must be valid JSON.'}, {status: 400});
    }
    return errorResponse(error);
  }
}
