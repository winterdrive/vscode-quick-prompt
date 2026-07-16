import { PatternRegistry } from '../../privacy/patternRegistry';
import { PREDEFINED_PATTERNS } from '../../privacy/masking/patternEngine';

describe('PatternRegistry.mask', () => {
    let registry: PatternRegistry;

    beforeEach(() => {
        registry = new PatternRegistry();
        registry.loadBuiltIn(PREDEFINED_PATTERNS);
    });

    it('masks every occurrence when a pattern matches multiple times and the label length differs from the match length', () => {
        const text = 'contact alice@example.com or bob@example.com today';
        const { maskedText, tokens } = registry.mask(text);

        expect(maskedText).toBe('contact [EMAIL-1] or [EMAIL-2] today');
        expect(tokens).toHaveLength(2);
        expect(tokens[0].originalValue).toBe('alice@example.com');
        expect(tokens[1].originalValue).toBe('bob@example.com');
        // No fragment of either original email should leak into the output.
        expect(maskedText).not.toContain('alice@example.com');
        expect(maskedText).not.toContain('bob@example.com');
        expect(maskedText).not.toContain('@example.com');
    });

    it('masks three or more occurrences of the same pattern correctly', () => {
        const text = 'a@x.com, b@x.com, c@x.com';
        const { maskedText, tokens } = registry.mask(text);

        expect(maskedText).toBe('[EMAIL-1], [EMAIL-2], [EMAIL-3]');
        expect(tokens.map(t => t.originalValue)).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
    });
});
