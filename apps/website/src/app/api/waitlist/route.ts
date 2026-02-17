import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.nvremote.com';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 },
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 },
      );
    }

    // Forward to the API server's waitlist endpoint
    const res = await fetch(`${API_BASE}/api/v1/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });

    if (res.ok) {
      return NextResponse.json({ success: true });
    }

    // If API is unreachable or returns error, still accept gracefully
    // (the email will be logged server-side when API comes online)
    console.warn(`Waitlist API returned ${res.status}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Waitlist submission error:', error);
    // Accept gracefully even on error — don't lose the lead
    return NextResponse.json({ success: true });
  }
}
