import * as vscode from 'vscode';

/**
 * Internationalization utility class
 * Provides multi-language string loading and formatting
 */
export class I18n {
    private static messages: { [key: string]: string } = {};
    private static isInitialized: boolean = false;

    /**
     * Initialize the i18n module
     * Load the message file for the corresponding language
     */
    public static async initialize(context: vscode.ExtensionContext): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            // Get VS Code language setting
            const locale = vscode.env.language || 'en';
            console.log(`Loading i18n for locale: ${locale}`);

            // Try to load the corresponding language file
            const loaded = await this.loadLanguageFile(context, locale);

            if (!loaded) {
                // If loading fails, try to load English as fallback
                console.log(`Failed to load ${locale}, trying fallback to English`);
                await this.loadLanguageFile(context, 'en');
            }

            this.isInitialized = true;
        } catch (error) {
            console.error('i18n initialization failed:', error);
            // Use English as the final fallback
            await this.loadLanguageFile(context, 'en');
            this.isInitialized = true;
        }
    }

    /**
     * Load the specified language file
     * @param context Extension context
     * @param locale Language code
     * @returns Whether loading succeeded
     */
    private static async loadLanguageFile(context: vscode.ExtensionContext, locale: string): Promise<boolean> {
        try {
            const uri = vscode.Uri.joinPath(context.extensionUri, 'i18n', `${locale}.json`);
            const content = await vscode.workspace.fs.readFile(uri);
            const messages = JSON.parse(content.toString());
            this.messages = messages;
            console.log(`Successfully loaded ${locale}.json`);
            return true;
        } catch (error) {
            console.log(`Failed to load ${locale}.json`);
            return false;
        }
    }

    /**
     * Get localized string
     * @param key Message key
     * @param args Formatting parameters
     * @returns Localized string
     */
    public static getMessage(key: string, ...args: string[]): string {
        let message = this.messages[key] || key;

        // Format string (replace {0}, {1}, ... placeholders)
        for (let i = 0; i < args.length; i++) {
            message = message.replace(new RegExp(`\\{${i}\\}`, 'g'), args[i]);
        }

        return message;
    }

    /**
     * Check if initialized
     * @returns Whether initialized
     */
    public static isReady(): boolean {
        return this.isInitialized;
    }

    /**
     * Reload language file (used when language setting changes)
     * @param context Extension context
     */
    public static async reload(context: vscode.ExtensionContext): Promise<void> {
        this.isInitialized = false;
        this.messages = {};
        await this.initialize(context);
    }
}
