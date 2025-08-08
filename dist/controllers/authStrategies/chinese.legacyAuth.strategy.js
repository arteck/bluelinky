import got from 'got';
import { initSession } from './china.authStrategy';
import Url from 'url';
export class ChineseLegacyAuthStrategy {
    constructor(environment) {
        this.environment = environment;
    }
    get name() {
        return 'ChineseLegacyAuthStrategy';
    }
    async login(user, options) {
        const cookieJar = await initSession(this.environment, options?.cookieJar);
        const { body, statusCode } = await got(this.environment.endpoints.login, {
            method: 'POST',
            json: true,
            body: {
                'email': user.username,
                'password': user.password,
            },
            cookieJar,
        });
        if (!body.redirectUrl) {
            throw new Error(`@ChineseLegacyAuthStrategy.login: sign In didn't work, could not retrieve auth code. status: ${statusCode}, body: ${JSON.stringify(body)}`);
        }
        const { code } = Url.parse(body.redirectUrl, true).query;
        if (!code) {
            throw new Error('@ChineseLegacyAuthStrategy.login: AuthCode was not found, you probably need to migrate your account.');
        }
        return {
            code: code,
            cookies: cookieJar,
        };
    }
}
//# sourceMappingURL=chinese.legacyAuth.strategy.js.map