import { getBrandEnvironment, } from '../constants/china';
import got from 'got';
import ChineseVehicle from '../vehicles/chinese.vehicle';
import { SessionController } from './controller';
import logger from '../logger';
import { URLSearchParams } from 'url';
import { asyncMap, manageBluelinkyError, uuidV4 } from '../tools/common.tools';
import { ChineseLegacyAuthStrategy } from './authStrategies/chinese.legacyAuth.strategy';
export class ChineseController extends SessionController {
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
        this.session.deviceId = uuidV4();
        this._environment = getBrandEnvironment(userConfig);
        this.authStrategies = {
            main: new ChineseLegacyAuthStrategy(this._environment),
        };
        logger.debug('CN Controller created');
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
            throw manageBluelinkyError(err, 'ChinaController.refreshAccessToken');
        }
        logger.debug('Token refreshed');
        return 'Token refreshed';
    }
    async enterPin() {
        if (this.session.accessToken === '') {
            throw 'Token not set';
        }
        try {
            const response = await got(`${this.environment.baseUrl}/api/v1/user/pin?token=`, {
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
            logger.debug(`controlToken is : ${this.session.controlToken}`);
            this.session.controlTokenExpiresAt = Math.floor(Date.now() / 1000 + response.body.expiresTime);
            return 'PIN entered OK, The pin is valid for 10 minutes';
        }
        catch (err) {
            throw manageBluelinkyError(err, 'ChinaController.pin');
        }
    }
    async login() {
        try {
            if (!this.userConfig.password || !this.userConfig.username) {
                throw new Error('@ChinaController.login: username and password must be defined.');
            }
            let authResult = null;
            try {
                logger.debug(`@ChinaController.login: Trying to sign in with ${this.authStrategies.main.name}`);
                authResult = await this.authStrategies.main.login({
                    password: this.userConfig.password,
                    username: this.userConfig.username,
                });
            }
            catch (e) {
                logger.error(`@ChinaController.login: sign in with ${this.authStrategies.main.name} failed with error ${e.toString()}`);
                logger.debug(`@ChinaController.login: Trying to sign in with ${this.authStrategies.main.name}`);
                authResult = await this.authStrategies.main.login({
                    password: this.userConfig.password,
                    username: this.userConfig.username,
                });
            }
            logger.debug('@ChinaController.login: Authenticated properly with user and password');
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
                },
                body: {
                    pushRegId: this.environment.pushRegId, //59af09e554a9442ab8589c9500d04d2e 
                    providerDeviceId: this.environment.providerDeviceId,
                    pushType: 'GCM',
                    uuid: uuidV4(),
                },
                json: true,
            });
            if (notificationReponse) {
                this.session.deviceId = notificationReponse.body.resMsg.deviceId;
            }
            logger.debug('@ChinaController.login: Device registered');
            const formData = new URLSearchParams();
            formData.append('grant_type', 'authorization_code');
            formData.append('redirect_uri', this.environment.endpoints.redirectUri);
            formData.append('code', authResult.code);
            const response = await got(this.environment.endpoints.token, {
                method: 'POST',
                headers: {
                    'Authorization': this.environment.basicToken,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Host': this.environment.host,
                    'Connection': 'Keep-Alive',
                    'Accept-Encoding': 'gzip',
                    'User-Agent': 'okhttp/3.10.0',
                    'grant_type': 'authorization_code',
                    //'ccsp-application-id': this.environment.appId,
                },
                body: formData.toString(),
                cookieJar: authResult.cookies,
            });
            if (response.statusCode !== 200) {
                throw new Error(`@ChinaController.login: Could not manage to get token: ${response.body}`);
            }
            if (response) {
                const responseBody = JSON.parse(response.body);
                this.session.accessToken = `Bearer ${responseBody.access_token}`;
                this.session.refreshToken = responseBody.refresh_token;
                this.session.tokenExpiresAt = Math.floor(Date.now() / 1000 + responseBody.expires_in);
            }
            logger.debug('@ChinaController.login: Session defined properly');
            logger.debug(`accessToken is ${this.session.accessToken}\n refreshToken is ${this.session.refreshToken}\n tokenExpiresAt : ${this.session.tokenExpiresAt}`);
            return 'Login success';
        }
        catch (err) {
            throw manageBluelinkyError(err, 'ChinaController.login');
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
                },
                json: true,
            });
            this.vehicles = await asyncMap(response.body.resMsg.vehicles, async (v) => {
                const vehicleProfileReponse = await got(`${this.environment.baseUrl}/api/v1/spa/vehicles/${v.vehicleId}/profile`, {
                    method: 'GET',
                    headers: {
                        ...this.defaultHeaders,
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
                };
                logger.debug(`@ChineseController.getVehicles: Added vehicle ${vehicleConfig.id}`);
                return new ChineseVehicle(vehicleConfig, this);
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
                'AuthorizationCCSP': this.session.controlToken,
                'ccsp-device-id': '2e062595-28e0-4bcb-a75a-1b395cde337c',
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
            },
            json: true,
        });
    }
    get defaultHeaders() {
        return {
            'Authorization': this.session.accessToken,
            'offset': (new Date().getTimezoneOffset() / 60).toFixed(0), //fix service 503 error.
            //'ccsp-device-id': this.session.deviceId,
            'ccsp-device-id': '2e062595-28e0-4bcb-a75a-1b395cde337c',
            'ccsp-application-id': this.environment.appId,
            'Content-Type': 'application/json',
            'User-Agent': 'okhttp/4.4.0',
        };
    }
}
//# sourceMappingURL=chinese.controller.js.map