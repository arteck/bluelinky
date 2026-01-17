import { CookieJar } from 'tough-cookie';
import { EULanguages, EuropeanBrandEnvironment } from '../../constants/europe';
import { AuthStrategy, Code, Token } from './authStrategy';
export declare class EuropeanBrandAuthStrategy implements AuthStrategy {
    private readonly environment;
    private readonly language;
    constructor(environment: EuropeanBrandEnvironment, language: EULanguages);
    get name(): string;
    login(user: {
        username: string;
        password: string;
    }, options?: {
        cookieJar?: CookieJar;
    }): Promise<{
        code: Code | Token;
        cookies: CookieJar;
    }>;
}
