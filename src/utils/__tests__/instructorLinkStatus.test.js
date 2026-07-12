import { describe, it, expect } from 'vitest';
import { deriveInstructorLinkStatus } from '../instructorLinkStatus.js';

describe('deriveInstructorLinkStatus', () => {
  it('returns "none" for null / undefined / empty', () => {
    expect(deriveInstructorLinkStatus(null)).toBe('none');
    expect(deriveInstructorLinkStatus(undefined)).toBe('none');
    expect(deriveInstructorLinkStatus([])).toBe('none');
  });

  it('returns "none" when only revoked links exist', () => {
    expect(deriveInstructorLinkStatus([{ status: 'revoked' }])).toBe('none');
  });

  it('returns "pending" when the aluna has only a pending link', () => {
    expect(deriveInstructorLinkStatus([{ status: 'pending' }])).toBe('pending');
    expect(deriveInstructorLinkStatus([{ status: 'revoked' }, { status: 'pending' }])).toBe('pending');
  });

  it('returns "active" when any link is active', () => {
    expect(deriveInstructorLinkStatus([{ status: 'active' }])).toBe('active');
  });

  it('prefers "active" over "pending" (active wins)', () => {
    expect(deriveInstructorLinkStatus([{ status: 'pending' }, { status: 'active' }])).toBe('active');
  });

  it('ignores malformed entries safely', () => {
    expect(deriveInstructorLinkStatus([null, undefined, { status: 'active' }])).toBe('active');
  });
});
