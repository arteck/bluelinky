import { CookieJar } from 'tough-cookie';
import { EuropeanBrandEnvironment } from '../../constants/europe';
export type Code = string;
export interface AuthStrategy {
    readonly name: string;
    login(user: {
        username: string;
        password: string;
    }, options?: {
        cookieJar?: CookieJar;
    }): Promise<{
        code: Code;
        cookies: CookieJar;
    }>;
}
export declare function initSession(environment: EuropeanBrandEnvironment, cookies?: CookieJar): Promise<CookieJar>;
