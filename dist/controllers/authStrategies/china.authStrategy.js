import got from 'got';
import { CookieJar } from 'tough-cookie';
export async function initSession(environment, cookies) {
    const cookieJar = cookies ?? new CookieJar();
    await got(environment.endpoints.session, { cookieJar });
    await got(environment.endpoints.language, {
        method: 'POST',
        body: '{"lang":"zh"}',
        cookieJar,
    });
    return cookieJar;
}
//# sourceMappingURL=china.authStrategy.js.map