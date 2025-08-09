import got from 'got';
import { CookieJar } from 'tough-cookie';
import Url from 'url';
export class AustraliaAuthStrategy {
    constructor(environment) {
        this.environment = environment;
    }
    get name() {
        return 'AustraliaAuthStrategy';
    }
    async login(user, options) {
        const cookieJar = options?.cookieJar ?? new CookieJar();
        await got(this.environment.endpoints.session, { cookieJar });
        const { body: bodyStr, statusCode } = await got(this.environment.endpoints.login, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({
                'email': user.username,
                'password': user.password,
                'mobileNum': '',
            }),
            cookieJar,
        });
        const body = JSON.parse(bodyStr);
        if (!body.redirectUrl) {
            throw new Error(`@AustraliaAuthStrategy.login: sign In didn't work, could not retrieve auth code. status: ${statusCode}, body: ${JSON.stringify(body)}`);
        }
        const { code } = Url.parse(body.redirectUrl, true).query;
        if (!code) {
            throw new Error('@AustraliaAuthStrategy.login: AuthCode was not found, you probably need to migrate your account.');
        }
        return {
            code: code,
            cookies: cookieJar,
        };
    }
}
//# sourceMappingURL=australia.authStrategy.js.map