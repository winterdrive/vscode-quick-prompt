/**
 * Main Masking Engine
 * Delegates masking to PatternRegistry (built-in patterns only).
 * Dictionary feature removed in v2 — custom rules via settings instead.
 */

import * as vscode from 'vscode';
import { MaskingResult, PrivacyConfig } from './types';
import { PREDEFINED_PATTERNS } from './masking/patternEngine';
import { PatternRegistry } from './patternRegistry';

export class MaskingEngine {
    private static instance: MaskingEngine | null = null;

    private registry: PatternRegistry;
    private config: PrivacyConfig;

    private constructor(context: vscode.ExtensionContext) {
        this.registry = new PatternRegistry();
        this.config = this.loadConfig();

        this.registry.loadBuiltIn(PREDEFINED_PATTERNS);
        this.registry.applyConfig(this.config);

        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('quickPrompt.privacy')) {
                this.config = this.loadConfig();
                this.registry.applyConfig(this.config);
            }
        });
    }

    public static getInstance(context?: vscode.ExtensionContext): MaskingEngine {
        if (!MaskingEngine.instance && context) {
            MaskingEngine.instance = new MaskingEngine(context);
        }
        if (!MaskingEngine.instance) {
            throw new Error('MaskingEngine not initialized. Call getInstance with context first.');
        }
        return MaskingEngine.instance;
    }

    private loadConfig(): PrivacyConfig {
        const config = vscode.workspace.getConfiguration('quickPrompt.privacy');
        return {
            enabled: config.get('enabled', true),
            autoMask: config.get('autoMask', true),
            patterns: {
                email:       config.get('patterns.email', true),
                phone:       config.get('patterns.phone', true),
                idCard:      config.get('patterns.idCard', true),
                apiKeys:     config.get('patterns.apiKeys', true),
                creditCard:  config.get('patterns.creditCard', false),
                ipAddress:   config.get('patterns.ipAddress', true),
                privateKey:  config.get('patterns.privateKey', true)
            },
            ui: {
                showNotification: config.get('ui.showNotification', true),
                maskLabel:        config.get('ui.maskLabel', '[MASKED]'),
                highlightColor:   config.get('ui.highlightColor', '#ff6b6b')
            }
        };
    }

    public async maskText(
        text: string,
        options?: {
            enablePatterns?: boolean;
            silent?: boolean;
        }
    ): Promise<MaskingResult> {
        const startTime = Date.now();

        if (!this.config.enabled) {
            return { maskedText: text, originalText: text, tokens: [], processingTime: 0, strategies: [] };
        }

        try {
            const result = this.registry.mask(text, {
                enableBuiltIn: options?.enablePatterns !== false,
                enableCustom: false
            });

            if (this.config.ui.showNotification && result.tokens.length > 0 && !options?.silent) {
                this.showMaskingNotification(result.tokens.length);
            }

            return {
                maskedText: result.maskedText,
                originalText: text,
                tokens: result.tokens,
                processingTime: Date.now() - startTime,
                strategies: result.tokens.length > 0 ? ['pattern'] : []
            };

        } catch (error) {
            console.error('[MaskingEngine] Error during masking:', error);
            return {
                maskedText: text,
                originalText: text,
                tokens: [],
                processingTime: Date.now() - startTime,
                strategies: ['error']
            };
        }
    }

    public updateConfig(config: Partial<PrivacyConfig>): void {
        this.config = { ...this.config, ...config };
        this.registry.applyConfig(this.config);
    }

    private showMaskingNotification(count: number): void {
        const message = `🔒 Masked ${count} sensitive item${count > 1 ? 's' : ''}`;
        vscode.window.showInformationMessage(message, 'Settings').then(selection => {
            if (selection === 'Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'quickPrompt.privacy');
            }
        });
    }
}
