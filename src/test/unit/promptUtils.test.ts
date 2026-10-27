import { generateAutoTitle } from '../../utils/promptUtils';

describe('generateAutoTitle', () => {
    it('splits on ASCII sentence punctuation', () => {
        expect(generateAutoTitle('Fix the bug. Then add tests.')).toBe('Fix the bug.');
        expect(generateAutoTitle('Really? Yes.')).toBe('Really?');
        expect(generateAutoTitle('Stop! Now.')).toBe('Stop!');
    });

    it('splits on full-width ideographic period', () => {
        expect(generateAutoTitle('請幫我重構這段程式碼。然後補上測試')).toBe('請幫我重構這段程式碼。');
    });

    it('splits on full-width exclamation mark', () => {
        expect(generateAutoTitle('這個函式有問題！請幫我找出原因')).toBe('這個函式有問題！');
    });

    it('splits on full-width question mark', () => {
        expect(generateAutoTitle('為什麼測試會失敗？我已經檢查過設定')).toBe('為什麼測試會失敗？');
    });

    it('returns the cleaned content when there is no sentence punctuation', () => {
        expect(generateAutoTitle('## Refactor helper')).toBe('Refactor helper');
    });
});
