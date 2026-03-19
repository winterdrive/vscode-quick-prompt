/**
 * MCP Logger — JSON-formatted structured logging for MCP server.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

export type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';

export class Logger {
    private server: Server | null = null;

    setServer(server: Server): void {
        this.server = server;
    }

    private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
        const entry = {
            ts: new Date().toISOString(),
            level,
            message,
            ...(data && { data }),
        };
        // Send via MCP logging notification if connected
        if (this.server) {
            try {
                this.server.sendLoggingMessage({ level, data: entry });
            } catch {
                // fallback to stderr
                process.stderr.write(JSON.stringify(entry) + '\n');
            }
        } else {
            process.stderr.write(JSON.stringify(entry) + '\n');
        }
    }

    debug(message: string, data?: Record<string, unknown>): void {
        this.log('debug', message, data);
    }

    info(message: string, data?: Record<string, unknown>): void {
        this.log('info', message, data);
    }

    notice(message: string, data?: Record<string, unknown>): void {
        this.log('notice', message, data);
    }

    warn(message: string, data?: Record<string, unknown>): void {
        this.log('warning', message, data);
    }

    error(message: string, data?: Record<string, unknown>): void {
        this.log('error', message, data);
    }

    critical(message: string, data?: Record<string, unknown>): void {
        this.log('critical', message, data);
    }
}

/** Singleton logger instance */
export const logger = new Logger();
