import got from 'got';
import { initSession } from './authStrategy';
import Url from 'url';
export class EuropeanLegacyAuthStrategy {
    constructor(environment, language) {
        this.environment = environment;
        this.language = language;
    }
    get name() {
        return 'EuropeanLegacyAuthStrategy';
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
            throw new Error(`@EuropeanLegacyAuthStrategy.login: sign In didn't work, could not retrieve auth code. status: ${statusCode}, body: ${JSON.stringify(body)}`);
        }
        const { code } = Url.parse(body.redirectUrl, true).query;
        if (!code) {
            throw new Error('@EuropeanLegacyAuthStrategy.login: AuthCode was not found, you probably need to migrate your account.');
        }
        return {
            code: code,
            cookies: cookieJar,
        };
    }
}
//# sourceMappingURL=european.legacyAuth.strategy.js.map