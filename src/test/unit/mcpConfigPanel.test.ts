import { escapeHtmlForWebview } from '../../mcp/McpConfigPanel'

describe('escapeHtmlForWebview', () => {
    it('escapes HTML special characters', () => {
        expect(escapeHtmlForWebview('<img src=x onerror=alert(1)>')).toBe(
            '&lt;img src=x onerror=alert(1)&gt;'
        )
    })

    it('escapes ampersands, quotes and apostrophes', () => {
        expect(escapeHtmlForWebview(`Tom & "Jerry" 'Show'`)).toBe(
            'Tom &amp; &quot;Jerry&quot; &#39;Show&#39;'
        )
    })

    it('leaves plain text untouched', () => {
        expect(escapeHtmlForWebview('my-workspace_01')).toBe('my-workspace_01')
    })
})
