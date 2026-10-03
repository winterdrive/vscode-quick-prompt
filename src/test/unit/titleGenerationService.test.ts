import { TitleGenerationService } from '../../services/titleGenerationService';
import { AIEngine } from '../../ai/aiEngine';

describe('TitleGenerationService', () => {
    it('logs only the error name when background AI generation fails', async () => {
        const sensitive = 'request to https://internal.example.com/v1?key=secret failed: prompt "my private text"';
        const aiEngine = { summarize: jest.fn().mockRejectedValue(new TypeError(sensitive)) } as unknown as AIEngine;
        const service = new TitleGenerationService(aiEngine);
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const onComplete = jest.fn();

        try {
            await (service as any).generateAITitleInBackground('content', 'fallback', onComplete);

            expect(errorSpy).toHaveBeenCalledTimes(1);
            expect(errorSpy.mock.calls[0]).toEqual(['[TitleGen] AI 生成失敗: TypeError']);
            expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('secret');
            expect(onComplete).not.toHaveBeenCalled();
        } finally {
            errorSpy.mockRestore();
        }
    });
});
