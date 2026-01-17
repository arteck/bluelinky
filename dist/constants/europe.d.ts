import { EuropeBlueLinkyConfig } from '../controllers/european.controller';
import { Brand } from '../interfaces/common.interfaces';
export type EULanguages = 'cs' | 'da' | 'nl' | 'en' | 'fi' | 'fr' | 'de' | 'it' | 'pl' | 'hu' | 'no' | 'sk' | 'es' | 'sv';
export declare const EU_LANGUAGES: EULanguages[];
export declare const DEFAULT_LANGUAGE: EULanguages;
export interface EuropeanBrandEnvironment {
    brand: Brand;
    host: string;
    baseUrl: string;
    ccspServiceID: string;
    ccspServiceSecret: string;
    ccspApplicationID: string;
    cfb: string;
    basicToken: string;
    pushType: string;
    loginFormHost: string;
    endpoints: {
        deviceIdURL: string;
        integrationInfoURL: string;
        silentSigninURL: string;
        languageURL: string;
        loginURL: string;
        tokenURL: string;
    };
    stamp: {
        result: string | null;
        error: Error | null;
    };
}
type BrandEnvironmentConfig = Pick<EuropeBlueLinkyConfig, 'brand'>;
export declare const getBrandEnvironment: ({ brand, }: BrandEnvironmentConfig) => EuropeanBrandEnvironment;
export {};
