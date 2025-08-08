import got from 'got';
import { CookieJar } from 'tough-cookie';
export async function initSession(environment, cookies) {
    const cookieJar = cookies ?? new CookieJar();
    await got(environment.endpoints.session, { cookieJar });
    // Language endpoint now requires authentication, so we skip it
    // Language will be set in the authentication URL instead
    return cookieJar;
}
//# sourceMappingURL=authStrategy.js.map