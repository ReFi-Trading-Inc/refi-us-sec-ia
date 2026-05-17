import { type NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Correlation ID — generated here, propagated to all downstream calls
  const correlationId = request.headers.get('x-correlation-id') ?? uuidv4();
  response.headers.set('x-correlation-id', correlationId);

  // Security headers (full CSP wired in MIG-P2-07)
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    // Skip static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
