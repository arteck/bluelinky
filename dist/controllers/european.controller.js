import { getBrandEnvironment, DEFAULT_LANGUAGE, EU_LANGUAGES, } from './../constants/europe';
import got from 'got';
import EuropeanVehicle from '../vehicles/european.vehicle';
import { SessionController } from './controller';
import logger from '../logger';
import { URLSearchParams } from 'url';
import { asyncMap, manageBluelinkyError, uuidV4 } from '../tools/common.tools';
import { EuropeanBrandAuthStrategy } from './authStrategies/european.brandAuth.strategy';
import { EuropeanLegacyAuthStrategy } from './authStrategies/european.legacyAuth.strategy';
export class EuropeanController extends SessionController {
    constructor(userConfig) {
        super(userConfig);
        this.session = {
            accessToken: undefined,
            refreshToken: undefined,
            controlToken: undefined,
            deviceId: uuidV4(),
            tokenExpiresAt: 0,
            controlTokenExpiresAt: 0,
        };
        this.vehicles = [];
        this.userConfig.language = userConfig.language ?? DEFAULT_LANGUAGE;
        if (!EU_LANGUAGES.includes(this.userConfig.language)) {
            throw new Error(`The language code ${this.userConfig.language} is not managed. Only ${EU_LANGUAGES.join(', ')} are.`);
        }
        this.session.deviceId = uuidV4();
        this._environment = getBrandEnvironment(userConfig);
        this.authStrategies = {
            main: new EuropeanBrandAuthStrategy(this._environment, this.userConfig.language),
            fallback: new EuropeanLegacyAuthStrategy(this._environment, this.userConfig.language),
        };
        logger.debug('EU Controller created');
    }
    get environment() {
        return this._environment;
    }
    async refreshAccessToken() {
        const shouldRefreshToken = Math.floor(Date.now() / 1000 - this.session.tokenExpiresAt) >= -10;
        if (!this.session.refreshToken) {
            logger.debug('Need refresh token to refresh access token. Use login()');
            return 'Need refresh token to refresh access token. Use login()';
        }
        if (!shouldRefreshToken) {
            logger.debug('Token not expired, no need to refresh');
            return 'Token not expired, no need to refresh';
        }
        const formData = new URLSearchParams();
        formData.append('grant_type', 'refresh_token');
        formData.append('redirect_uri', 'https://www.getpostman.com/oauth2/callback'); // Oversight from Hyundai developers
        formData.append('refresh_token', this.session.refreshToken);
        try {
            const response = await got(this.environment.endpoints.token, {
                method: 'POST',
                headers: {
                    'Authorization': this.environment.basicToken,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Host': this.environment.host,
                    'Connection': 'Keep-Alive',
                    'Accept-Encoding': 'gzip',
                    'User-Agent': 'okhttp/3.10.0',
                },
                body: formData.toString(),
                throwHttpErrors: false,
            });
            if (response.statusCode !== 200) {
                logger.debug(`Refresh token failed: ${response.body}`);
                return `Refresh token failed: ${response.body}`;
            }
            const responseBody = JSON.parse(response.body);
            this.session.accessToken = 'Bearer ' + responseBody.access_token;
            this.session.tokenExpiresAt = Math.floor(Date.now() / 1000 + responseBody.expires_in);
        }
        catch (err) {
            throw manageBluelinkyError(err, 'EuropeController.refreshAccessToken');
        }
        logger.debug('Token refreshed');
        return 'Token refreshed';
    }
    async enterPin() {
        if (this.session.accessToken === '') {
            throw 'Token not set';
        }
        try {
            const response = await got(`${this.environment.baseUrl}/api/v1/user/pin`, {
                method: 'PUT',
                headers: {
                    'Authorization': this.session.accessToken,
                    'Content-Type': 'application/json',
                },
                body: {
                    deviceId: this.session.deviceId,
                    pin: this.userConfig.pin,
                },
                json: true,
            });
            this.session.controlToken = 'Bearer ' + response.body.controlToken;
            this.session.controlTokenExpiresAt = Math.floor(Date.now() / 1000 + response.body.expiresTime);
            return 'PIN entered OK, The pin is valid for 10 minutes';
        }
        catch (err) {
            throw manageBluelinkyError(err, 'EuropeController.pin');
        }
    }
    async login() {
        try {
            if (!this.userConfig.password || !this.userConfig.username) {
                throw new Error('@EuropeController.login: username and password must be defined.');
            }
            let authResult = null;
            try {
                logger.debug(`@EuropeController.login: Trying to sign in with ${this.authStrategies.main.name}`);
                authResult = await this.authStrategies.main.login({
                    password: this.userConfig.password,
                    username: this.userConfig.username,
                });
            }
            catch (e) {
                logger.error(`@EuropeController.login: sign in with ${this.authStrategies.main.name} failed with error ${e.toString()}`);
                logger.debug(`@EuropeController.login: Trying to sign in with ${this.authStrategies.fallback.name}`);
                authResult = await this.authStrategies.fallback.login({
                    password: this.userConfig.password,
                    username: this.userConfig.username,
                });
            }
            logger.debug('@EuropeController.login: Authenticated properly with user and password');
            const genRanHex = size => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
            const notificationReponse = await got(`${this.environment.baseUrl}/api/v1/spa/notifications/register`, {
                method: 'POST',
                headers: {
                    'ccsp-service-id': this.environment.clientId,
                    'Content-Type': 'application/json;charset=UTF-8',
                    'Host': this.environment.host,
                    'Connection': 'Keep-Alive',
                    'Accept-Encoding': 'gzip',
                    'User-Agent': 'okhttp/3.10.0',
                    'ccsp-application-id': this.environment.appId,
                    'Stamp': await this.environment.stamp(),
                },
                body: {
                    pushRegId: genRanHex(64),
                    pushType: 'APNS',
                    uuid: this.session.deviceId,
                },
                json: true,
            });
            if (notificationReponse) {
                this.session.deviceId = notificationReponse.body.resMsg.deviceId;
            }
            logger.debug('@EuropeController.login: Device registered');
            // Updated token exchange to use new endpoint based on Python fix
            const tokenUrl = this.environment.brand === 'kia'
                ? 'https://idpconnect-eu.kia.com/auth/api/v2/user/oauth2/token'
                : 'https://idpconnect-eu.hyundai.com/auth/api/v2/user/oauth2/token';
            const tokenFormData = new URLSearchParams();
            tokenFormData.append('grant_type', 'authorization_code');
            tokenFormData.append('code', authResult.code);
            tokenFormData.append('redirect_uri', `${this.environment.baseUrl}/api/v1/user/oauth2/redirect`);
            tokenFormData.append('client_id', this.environment.clientId);
            tokenFormData.append('client_secret', 'secret');
            const response = await got(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'okhttp/3.10.0',
                },
                body: tokenFormData.toString(),
                cookieJar: authResult.cookies,
                throwHttpErrors: false,
            });
            if (response.statusCode !== 200) {
                throw new Error(`@EuropeController.login: Could not manage to get token: ${response.body}`);
            }
            if (response) {
                const responseBody = JSON.parse(response.body);
                this.session.accessToken = `Bearer ${responseBody.access_token}`;
                this.session.refreshToken = responseBody.refresh_token;
                this.session.tokenExpiresAt = Math.floor(Date.now() / 1000 + responseBody.expires_in);
            }
            logger.debug('@EuropeController.login: Session defined properly');
            return 'Login success';
        }
        catch (err) {
            throw manageBluelinkyError(err, 'EuropeController.login');
        }
    }
    async logout() {
        return 'OK';
    }
    async getVehicles() {
        if (this.session.accessToken === undefined) {
            throw 'Token not set';
        }
        try {
            const response = await got(`${this.environment.baseUrl}/api/v1/spa/vehicles`, {
                method: 'GET',
                headers: {
                    ...this.defaultHeaders,
                    'Stamp': await this.environment.stamp(),
                },
                json: true,
            });
            this.vehicles = await asyncMap(response.body.resMsg.vehicles, async (v) => {
                const vehicleProfileReponse = await got(`${this.environment.baseUrl}/api/v1/spa/vehicles/${v.vehicleId}/profile`, {
                    method: 'GET',
                    headers: {
                        ...this.defaultHeaders,
                        'Stamp': await this.environment.stamp(),
                    },
                    json: true,
                });
                const vehicleProfile = vehicleProfileReponse.body.resMsg;
                const vehicleConfig = {
                    nickname: v.nickname,
                    name: v.vehicleName,
                    regDate: v.regDate,
                    brandIndicator: 'H',
                    id: v.vehicleId,
                    vin: vehicleProfile.vinInfo[0].basic.vin,
                    generation: vehicleProfile.vinInfo[0].basic.modelYear,
                    ccuCCS2ProtocolSupport: !!v.ccuCCS2ProtocolSupport
                };
                logger.debug(`@EuropeController.getVehicles: Added vehicle ${vehicleConfig.id}`);
                return new EuropeanVehicle(vehicleConfig, this);
            });
        }
        catch (err) {
            throw manageBluelinkyError(err, 'EuropeController.getVehicles');
        }
        return this.vehicles;
    }
    async checkControlToken() {
        await this.refreshAccessToken();
        if (this.session?.controlTokenExpiresAt !== undefined) {
            if (!this.session.controlToken || Date.now() / 1000 > this.session.controlTokenExpiresAt) {
                await this.enterPin();
            }
        }
    }
    async getVehicleHttpService() {
        await this.checkControlToken();
        return got.extend({
            baseUrl: this.environment.baseUrl,
            headers: {
                ...this.defaultHeaders,
                'Authorization': this.session.controlToken,
                'Stamp': await this.environment.stamp(),
            },
            json: true,
        });
    }
    async getApiHttpService() {
        await this.refreshAccessToken();
        return got.extend({
            baseUrl: this.environment.baseUrl,
            headers: {
                ...this.defaultHeaders,
                'Stamp': await this.environment.stamp(),
            },
            json: true,
        });
    }
    get defaultHeaders() {
        return {
            'Authorization': this.session.accessToken,
            'offset': (new Date().getTimezoneOffset() / 60).toFixed(2),
            'ccsp-device-id': this.session.deviceId,
            'ccsp-application-id': this.environment.appId,
            'Content-Type': 'application/json',
        };
    }
}
//# sourceMappingURL=european.controller.js.map