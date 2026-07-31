import { SecretStorageManager } from '../../privacy/masking/secretStorage';

class FakeSecretStorage {
    private data = new Map<string, string>();

    async get(key: string): Promise<string | undefined> {
        return this.data.get(key);
    }

    async store(key: string, value: string): Promise<void> {
        this.data.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this.data.delete(key);
    }

    setRaw(key: string, raw: string): void {
        this.data.set(key, raw);
    }
}

describe('SecretStorageManager', () => {
    let secrets: FakeSecretStorage;
    let manager: SecretStorageManager;

    beforeEach(() => {
        secrets = new FakeSecretStorage();
        manager = new SecretStorageManager(secrets as unknown as ConstructorParameters<typeof SecretStorageManager>[0]);
    });

    it('round-trips a valid token map', async () => {
        await manager.store('p1', { '[NAME-1]': 'Alice' });
        await expect(manager.retrieve('p1')).resolves.toEqual({ '[NAME-1]': 'Alice' });
    });

    it('returns undefined when nothing is stored', async () => {
        await expect(manager.retrieve('missing')).resolves.toBeUndefined();
    });

    it('returns undefined instead of throwing when the stored value is unparsable JSON', async () => {
        secrets.setRaw('quickPrompt.tokenMap.p1', 'not-json');
        await expect(manager.retrieve('p1')).resolves.toBeUndefined();
    });

    it('returns undefined instead of a corrupting value when the stored JSON is a bare array', async () => {
        secrets.setRaw('quickPrompt.tokenMap.p1', JSON.stringify(['a', 'b']));
        await expect(manager.retrieve('p1')).resolves.toBeUndefined();
    });

    it('returns undefined when a token map value is not a string', async () => {
        secrets.setRaw('quickPrompt.tokenMap.p1', JSON.stringify({ '[NAME-1]': 123 }));
        await expect(manager.retrieve('p1')).resolves.toBeUndefined();
    });
});
