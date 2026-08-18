class PermissionUtil {

    /**
     * Grant browser permissions to the current context.
     * @param {import('@playwright/test').Page | import('@playwright/test').BrowserContext} pageOrContext
     * @param {Array<string>} permissions - e.g. ['geolocation', 'camera', 'microphone', 'notifications']
     * @param {string} origin - e.g. 'https://dev.superj.app'
     */
    static async grantPermissions(pageOrContext, permissions = ['geolocation', 'camera', 'microphone'], origin = 'https://dev.superj.app') {
        try {
            const context = pageOrContext.context ? pageOrContext.context() : pageOrContext;
            await context.grantPermissions(permissions, { origin });
            console.log(`[PermissionUtil] Granted permissions [${permissions.join(', ')}] for origin: ${origin}`);
            return true;
        } catch (e) {
            console.error(`[PermissionUtil] Error granting permissions:`, e.message);
            return false;
        }
    }

    /**
     * Grant Geolocation permission and set coordinates (Default: Bangalore, India).
     * @param {import('@playwright/test').Page | import('@playwright/test').BrowserContext} pageOrContext
     * @param {Object} coords - { latitude, longitude }
     * @param {string} origin
     */
    static async setGeolocation(pageOrContext, coords = { latitude: 12.9716, longitude: 77.5946 }, origin = 'https://dev.superj.app') {
        try {
            const context = pageOrContext.context ? pageOrContext.context() : pageOrContext;
            await context.grantPermissions(['geolocation'], { origin });
            await context.setGeolocation(coords);
            console.log(`[PermissionUtil] Set Geolocation to (${coords.latitude}, ${coords.longitude}) for origin: ${origin}`);
            return true;
        } catch (e) {
            console.error(`[PermissionUtil] Error setting geolocation:`, e.message);
            return false;
        }
    }

    /**
     * Grant Camera and Microphone access.
     * @param {import('@playwright/test').Page | import('@playwright/test').BrowserContext} pageOrContext
     * @param {string} origin
     */
    static async grantMediaPermissions(pageOrContext, origin = 'https://dev.superj.app') {
        return await this.grantPermissions(pageOrContext, ['camera', 'microphone'], origin);
    }

    /**
     * Grant Notification permissions.
     * @param {import('@playwright/test').Page | import('@playwright/test').BrowserContext} pageOrContext
     * @param {string} origin
     */
    static async grantNotificationPermission(pageOrContext, origin = 'https://dev.superj.app') {
        return await this.grantPermissions(pageOrContext, ['notifications'], origin);
    }

    /**
     * Clear all granted permissions for current context.
     * @param {import('@playwright/test').Page | import('@playwright/test').BrowserContext} pageOrContext
     */
    static async clearPermissions(pageOrContext) {
        try {
            const context = pageOrContext.context ? pageOrContext.context() : pageOrContext;
            await context.clearPermissions();
            console.log(`[PermissionUtil] Cleared all permissions.`);
            return true;
        } catch (e) {
            console.error(`[PermissionUtil] Error clearing permissions:`, e.message);
            return false;
        }
    }
}

module.exports = PermissionUtil;
