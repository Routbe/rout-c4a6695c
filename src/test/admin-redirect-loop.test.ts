import { describe, it, expect, vi } from 'vitest';
import { modeDecision } from '../lib/app-mode';
import { DEFAULT_DESTINATION } from '../lib/auth/post-auth';

describe('Admin portal redirect logic', () => {
  it('should verify that DEFAULT_DESTINATION triggers a redirect in admin mode', () => {
    // Current hardcoded destination
    expect(DEFAULT_DESTINATION).toBe('/dashboard');
    
    // In admin mode, /dashboard triggers a redirect to sign-in (or /admin)
    const decision = modeDecision('admin', DEFAULT_DESTINATION);
    expect(decision.kind).toBe('redirect');
    if (decision.kind !== 'redirect') throw new Error('expected redirect');
    expect(decision.to).toBe('/auth/sign-in?redirect=%2Fadmin');
  });
});
