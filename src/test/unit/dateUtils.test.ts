import { formatRelativeTime, getRelativeTime } from '../../utils/dateUtils';

describe('dateUtils', () => {
    describe('formatRelativeTime', () => {
        it('returns a placeholder instead of "NaN" for malformed date strings', () => {
            const result = formatRelativeTime('not-a-date');
            expect(result).not.toContain('NaN');
            expect(result).toBe('—');
        });

        it('returns a placeholder for missing date values (malformed prompts.json entry)', () => {
            const result = formatRelativeTime(undefined as unknown as string);
            expect(result).not.toContain('NaN');
            expect(result).toBe('—');
        });

        it('still formats a valid date', () => {
            expect(formatRelativeTime(new Date().toISOString())).not.toBe('—');
        });
    });

    describe('getRelativeTime', () => {
        it('returns a placeholder for NaN / undefined timestamps', () => {
            expect(getRelativeTime(NaN)).toBe('—');
            expect(getRelativeTime(undefined as unknown as number)).toBe('—');
        });

        it('still formats a valid timestamp', () => {
            const result = getRelativeTime(Date.now() - 5 * 60000);
            expect(result).not.toBe('—');
            expect(result).not.toContain('NaN');
        });
    });
});
