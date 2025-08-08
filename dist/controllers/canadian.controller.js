import got from 'got';
import crypto from 'node:crypto';
import { fetch, Agent } from 'undici';
import { getBrandEnvironment } from '../constants/canada';
import CanadianVehicle from '../vehicles/canadian.vehicle';
import { SessionController } from './controller';
import logger from '../logger';
import { manageBluelinkyError } from '../tools/common.tools';
export class CanadianController extends SessionController {
    constructor(userConfig) {
        super(userConfig);
        this.vehicles = [];
        this.timeOffset = -(new Date().getTimezoneOffset() / 60);
        logger.debug('CA Controller created');
        this._environment = getBrandEnvironment(userConfig.brand);
    }
    get environment() {
        return this._environment;
    }
    async refreshAccessToken() {
        const shouldRefreshToken = Math.floor(Date.now() / 1000 - this.session.tokenExpiresAt) >= -10;
        logger.debug('shouldRefreshToken: ' + shouldRefreshToken.toString());
        if (this.session.refreshToken && shouldRefreshToken) {
            // TODO: someone should find the refresh token API url then we dont have to do this hack
            // the previously used CA_ENDPOINTS.verifyToken did not refresh it only provided if the token was valid
            await this.login();
            logger.debug('Token refreshed');
            return 'Token refreshed';
        }
        logger.debug('Token not expired, no need to refresh');
        return 'Token not expired, no need to refresh';
    }
    async login() {
        logger.info('Begin login request');
        try {
            const response = await this.request(this.environment.endpoints.login, {
                loginId: this.userConfig.username,
                password: this.userConfig.password,
            });
            logger.debug(response.result);
            this.session.accessToken = response.result.accessToken;
            this.session.refreshToken = response.result.refreshToken;
            this.session.tokenExpiresAt = Math.floor(+new Date() / 1000 + response.result.expireIn);
            return 'login good';
        }
        catch (err) {
            return 'error: ' + err;
        }
    }
    async logout() {
        return 'OK';
    }
    async getVehicles() {
        logger.info('Begin getVehicleList request');
        try {
            const response = await this.request(this.environment.endpoints.vehicleList, {});
            const data = response.result;
            if (data.vehicles === undefined) {
                this.vehicles = [];
                return this.vehicles;
            }
            data.vehicles.forEach(vehicle => {
                const vehicleConfig = {
                    nickname: vehicle.nickName,
                    name: vehicle.nickName,
                    vin: vehicle.vin,
                    regDate: vehicle.enrollmentDate,
                    brandIndicator: vehicle.brandIndicator,
                    regId: vehicle.regid,
                    id: vehicle.vehicleId,
                    generation: vehicle.genType,
                };
                this.vehicles.push(new CanadianVehicle(vehicleConfig, this));
            });
            return this.vehicles;
        }
        catch (err) {
            logger.debug(err);
            return this.vehicles;
        }
    }
    //////////////////////////////////////////////////////////////////////////////
    // Internal
    //////////////////////////////////////////////////////////////////////////////
    // TODO: not quite sure how to type this if it's dynamic?
    /* eslint-disable @typescript-eslint/no-explicit-any */
    async request(endpoint, body, headers = {}) {
        logger.debug(`[${endpoint}] ${JSON.stringify(headers)} ${JSON.stringify(body)}`);
        const [major, ,] = process.versions.node.split('.').map(Number);
        if (major >= 21) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
            logger.debug('Node version >= 21, using fetch instead of got');
            const options = {
                method: 'POST',
                body: JSON.stringify(body),
                headers: {
                    from: this.environment.origin,
                    language: 0,
                    offset: this.timeOffset,
                    accessToken: this.session.accessToken,
                    Origin: 'https://kiaconnect.ca',
                    Referer: 'https://kiaconnect.ca/login',
                    'Content-Type': 'application/json',
                    ...headers,
                },
                dispatcher: new Agent({
                    connect: {
                        rejectUnauthorized: false,
                        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
                    }
                }),
            };
            try {
                const response = await fetch(endpoint, options);
                const data = await response.json();
                return data;
            }
            catch (err) {
                logger.error(err);
                return;
            }
        }
        try {
            const response = await got(endpoint, {
                method: 'POST',
                json: true,
                headers: {
                    from: this.environment.origin,
                    language: 1,
                    offset: this.timeOffset,
                    accessToken: this.session.accessToken,
                    ...headers,
                },
                body: {
                    ...body,
                },
            });
            if (response.body.responseHeader.responseCode != 0) {
                throw response.body.responseHeader.responseDesc;
            }
            return response.body;
        }
        catch (err) {
            throw manageBluelinkyError(err, 'CanadianController');
        }
    }
}
//# sourceMappingURL=canadian.controller.js.map