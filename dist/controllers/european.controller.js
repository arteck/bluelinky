"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EuropeanController = void 0;
const europe_1 = require("./../constants/europe");
const got_1 = __importDefault(require("got"));
const european_vehicle_1 = __importDefault(require("../vehicles/european.vehicle"));
const controller_1 = require("./controller");
const logger_1 = __importDefault(require("../logger"));
const url_1 = require("url");
const common_tools_1 = require("../tools/common.tools");
// Predefined user-agent strings and other headers (could be imported from constants)
const USER_AGENT_OK_HTTP = 'okhttp/3.12.0';
const USER_AGENT_MOZILLA = 'Mozilla/5.0 (Linux; Android 4.1.1; Galaxy Nexus) AppleWebKit/535.19 Chrome/18.0.1025.166 Mobile Safari/535.19';
const CONTENT_TYPE_JSON = 'application/json;charset=UTF-8';
const CONTENT_TYPE_FORM = 'application/x-www-form-urlencoded';
class EuropeanController extends controller_1.SessionController {
    constructor(userConfig) {
        super(userConfig);
        this.session = {
            accessToken: undefined,
            refreshToken: undefined,
            controlToken: undefined,
            deviceId: (0, common_tools_1.uuidV4)(),
            tokenExpiresAt: 0,
            controlTokenExpiresAt: 0,
        };
        this.vehicles = [];
        this.userConfig.language = userConfig.language ?? europe_1.DEFAULT_LANGUAGE;
        if (!europe_1.EU_LANGUAGES.includes(this.userConfig.language)) {
            throw new Error(`The language code ${this.userConfig.language} is not managed. Only ${europe_1.EU_LANGUAGES.join(', ')} are.`);
        }
        this.session.deviceId = (0, common_tools_1.uuidV4)();
        this._environment = (0, europe_1.getBrandEnvironment)(userConfig);
        // Initialize brand-specific constants (URLs, IDs, etc.)
        if (this.userConfig.brand === 'kia') {
            this.LOGIN_FORM_HOST = 'https://idpconnect-eu.kia.com';
            this.PUSH_TYPE = 'APNS';
        }
        else {
            this.LOGIN_FORM_HOST = 'https://eu-account.hyundai.com';
            this.PUSH_TYPE = 'GCM';
        }
        logger_1.default.debug('EU Controller created');
    }
    get environment() {
        return this._environment;
    }
    async getDeviceId() {
        const genRanHex = size => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        const notificationReponse = await got_1.default.post(`${this.environment.baseUrl}/api/v1/spa/notifications/register`, {
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
                pushType: this.PUSH_TYPE,
                uuid: this.session.deviceId,
            },
            json: true,
        });
        if (notificationReponse) {
            this.session.deviceId = notificationReponse.body.resMsg.deviceId;
        }
        logger_1.default.debug('@EuropeController.login: Device registered');
        return 'OK';
    }
    /*
      private async getSessionCookies(): Promise<Headers | Record<string, string>> {
        const url = `${this.environment.baseUrl}/api/v1/user/oauth2/authorize?response_type=code&state=test&client_id=${this.environment.clientId}&redirect_uri=${encodeURIComponent(this.environment.endpoints.redirectUri)}&lang=${this.userConfig.language}`;
        const resp = await got.get(url, { followRedirect: false });
        return resp.headers;
      }
    */
    async setSessionLanguage() {
        const url = `${this.environment.endpoints.language}`;
        await got_1.default.post(url, {
            headers: {
                'Content-Type': CONTENT_TYPE_JSON,
                'User-Agent': USER_AGENT_OK_HTTP,
            },
            body: JSON.stringify({ language: this.userConfig.language, }),
        }).catch(() => { });
    }
    async enterPin() {
        if (this.session.accessToken === '') {
            throw 'Token not set';
        }
        try {
            const response = await got_1.default.put(`${this.environment.baseUrl}/api/v1/user/pin`, {
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
            throw (0, common_tools_1.manageBluelinkyError)(err, 'EuropeController.pin');
        }
    }
    async login() {
        //const stamp = await this.environment.stamp();
        const username = this.userConfig.username !== undefined ? this.userConfig.username : '';
        const password = this.userConfig.password !== undefined ? this.userConfig.password : '';
        await this.getDeviceId();
        //const sessionCookies = await this.getSessionCookies();
        await this.setSessionLanguage();
        if (this.userConfig.brand === 'kia') {
            // 📌 Kia EU: Use password as a refresh token to get access token directly
            const refreshToken = this.userConfig.password;
            this.session.refreshToken = refreshToken;
            await this.refreshAccessToken();
            return 'OK';
        }
        // Hyundai or Genesis:
        let authorizationCode = null;
        try {
            authorizationCode = await this.getAuthCodeDirect(username, password);
        }
        catch (err) {
            authorizationCode = await this.getAuthCodeViaForm(username, password);
        }
        if (!authorizationCode) {
            throw new Error('Login Failed: Authorization code not obtained');
        }
        // Exchange authorization code for tokens
        const tokenData = await this.exchangeAuthCodeForToken(authorizationCode);
        // Ensure we have a refresh token. Hyundai’s first token response may not include one, so fetch if needed.
        let refreshToken = tokenData.refreshToken;
        if (this.userConfig.brand === 'hyundai') {
            if (!refreshToken) {
                refreshToken = await this.fetchRefreshToken();
            }
        }
        else {
            // For Genesis, if not provided, we reuse the auth code as refresh (rarely needed).
            if (!refreshToken)
                refreshToken = authorizationCode;
        }
        this.session.accessToken = tokenData.accessToken;
        this.session.refreshToken = refreshToken;
        this.session.tokenExpiresAt = Math.floor(Date.now() / 1000 + tokenData.expiresIn);
        return 'OK';
    }
    async getAuthCodeDirect(username, password) {
        if (this.userConfig.brand === 'hyundai') {
            const url = this.environment.endpoints.login;
            const resp = await got_1.default.post(url, {
                headers: { 'Content-Type': CONTENT_TYPE_JSON },
                body: JSON.stringify({ email: username, password: password }),
                // Include session cookies if needed (implementation specific)
            });
            const data = JSON.parse(resp.body);
            const redirectUrl = data.redirectUrl;
            if (!redirectUrl)
                throw new Error('No redirectUrl in response');
            const code = new URL(redirectUrl).searchParams.get('code');
            if (!code)
                throw new Error('AuthCode not found in redirectUrl');
            return code;
        }
        // Kia or Genesis do not support this JSON signin method
        throw new Error('Direct auth code retrieval not supported for this brand');
    }
    async getAuthCodeViaForm(username, password) {
        // Step 1: Get integration info (contains serviceId and userId for the session)
        const infoUrl = this.environment.endpoints.integration;
        const infoResp = await got_1.default.get(infoUrl, {
            headers: { 'User-Agent': USER_AGENT_MOZILLA },
        });
        const info = JSON.parse(infoResp.body);
        const serviceId = info.serviceId;
        const userId = info.userId;
        // Step 2: Construct the appropriate authorization URL for the brand’s login page
        let authPageUrl;
        if (this.userConfig.brand === 'hyundai') {
            // Hyundai EU auth realm (Keycloak)
            authPageUrl = `${this.LOGIN_FORM_HOST}/auth/realms/euhyundaiidm/protocol/openid-connect/auth` +
                `?client_id=${this.environment.clientId}&scope=openid%20profile%20email%20phone&response_type=code&hkid_session_reset=true` +
                `&redirect_uri=${encodeURIComponent('${this.environment.baseUrl}/api/v1/user/integration/redirect/login')}` +
                `&ui_locales=${this.userConfig.language}&state=${serviceId}:${userId}`;
        }
        else {
            // Kia fallback (not typically used, since Kia doesn’t require auth code in this flow)
            authPageUrl = `${this.LOGIN_FORM_HOST}/auth/api/v2/user/oauth2/authorize?response_type=code&client_id=${this.environment.clientId}` +
                `&redirect_uri=${encodeURIComponent(this.environment.endpoints.redirectUri)}&lang=${this.userConfig.language}&state=ccsp`;
        }
        const authPageResp = await got_1.default.get(authPageUrl, { headers: { 'User-Agent': USER_AGENT_MOZILLA }, followRedirect: false });
        let rawLocation = authPageResp.headers['location'];
        let location = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation ?? '';
        if (location && location.includes('connector_session_key')) {
            await got_1.default.get(location, { headers: { 'User-Agent': USER_AGENT_MOZILLA }, followRedirect: false });
            rawLocation = authPageResp.headers['location'];
            location = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation ?? '';
        }
        let loginPageHtml;
        if (authPageResp.statusCode === 200) {
            loginPageHtml = await authPageResp.body;
        }
        else if (location) {
            const loginPageResp = await fetch(location, { headers: { 'User-Agent': USER_AGENT_MOZILLA } });
            loginPageHtml = await loginPageResp.body;
        }
        else {
            throw new Error('Could not retrieve login form page');
        }
        // Step 3: Parse the login form action URL from the HTML
        const formActionMatch = loginPageHtml.match(/<form[^>]*action='([^']+)'[^>]*>/);
        if (!formActionMatch) {
            return null;
        }
        let formActionUrl = formActionMatch[1];
        formActionUrl = formActionUrl.replace(/&amp;/g, '&'); // decode any &amp; to &
        // Prepare form data
        const formData = new url_1.URLSearchParams({
            username: username,
            password: password,
            credentialId: '',
            rememberMe: 'on'
        });
        // Some forms might require additional hidden fields like connector_session_key or _csrf; these would be appended here if needed.
        // Submit the login form
        const formResp = await got_1.default.post(formActionUrl, {
            headers: { 'Content-Type': CONTENT_TYPE_FORM, 'User-Agent': USER_AGENT_MOZILLA },
            body: formData.toString(),
            followRedirect: false
        });
        if (formResp.statusCode !== 302) {
            // If credentials are wrong or other error (not redirected to code)
            return null;
        }
        rawLocation = authPageResp.headers['location'];
        const nextLocation = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation ?? '';
        if (!nextLocation) {
            return null;
        }
        // Step 4: Follow final redirect(s) to get the code
        // The nextLocation likely contains the code as a URL param or will redirect to a URL with the code.
        let code = null;
        if (nextLocation.includes('code=')) {
            // Code is directly in the redirect URL
            code = new URL(nextLocation).searchParams.get('code');
        }
        else {
            // Follow the redirect to capture the code from the final URL
            const finalResp = await got_1.default.get(nextLocation, { headers: { 'User-Agent': USER_AGENT_MOZILLA }, followRedirect: false });
            rawLocation = finalResp.headers['location'];
            const finalLocation = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation ?? finalResp.url;
            if (finalLocation) {
                code = new URL(finalLocation).searchParams.get('code');
            }
        }
        return code;
    }
    async exchangeAuthCodeForToken(authCode) {
        // Hyundai and Genesis use the CCSP user API token endpoint with client credentials
        const tokenUrl = this.environment.endpoints.token;
        const headers = {
            'Authorization': this.environment.basicToken, // Basic auth with client_id:secret
            'Stamp': await this.environment.stamp(),
            'Content-Type': CONTENT_TYPE_FORM,
            'Host': this.environment.baseUrl,
            'Connection': 'close',
            'Accept-Encoding': 'gzip, deflate',
            'User-Agent': USER_AGENT_OK_HTTP
        };
        const body = new url_1.URLSearchParams({
            grant_type: 'authorization_code',
            redirect_uri: `${this.environment.baseUrl}/api/v1/user/oauth2/redirect`,
            code: authCode
        });
        const resp = await got_1.default.post(tokenUrl, { headers, body: body.toString(), });
        const data = JSON.parse(resp.body);
        if (!data.access_token) {
            throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
        }
        const tokenType = data.token_type || 'Bearer';
        const accessToken = `${tokenType} ${data.access_token}`;
        const expiresIn = data.expires_in || 0;
        const refreshToken = data.refresh_token ? (data.refresh_token.startsWith(tokenType) ? data.refresh_token : `${tokenType} ${data.refresh_token}`) : undefined;
        return { accessToken, refreshToken, expiresIn };
    }
    async refreshAccessToken() {
        // Kia (and Genesis, if using this path) use their IDP host for token exchange (with client_secret 'secret') 
        const tokenUrl = `${this.LOGIN_FORM_HOST}/auth/api/v2/user/oauth2/token`;
        const body = new url_1.URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: this.session.refreshToken ?? '',
            client_id: this.environment.clientId,
            client_secret: 'secret'
        });
        const resp = await got_1.default.post(tokenUrl, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        const data = JSON.parse(resp.body);
        if (!data.access_token) {
            throw new Error(`Refresh token exchange failed: ${JSON.stringify(data)}`);
        }
        const tokenType = data.token_type || 'Bearer';
        const accessToken = `${tokenType} ${data.access_token}`;
        // The response's 'refresh_token' field **is actually the new refresh token** in this context
        const newRefreshToken = data.refresh_token || this.session.refreshToken;
        this.session.accessToken = accessToken;
        this.session.refreshToken = newRefreshToken;
        const expiresIn = data.expires_in || 0;
        this.session.tokenExpiresAt = Math.floor(Date.now() / 1000 + expiresIn);
        return 'OK';
    }
    async fetchRefreshToken() {
        const url = this.environment.endpoints.token;
        const headers = {
            'Authorization': this.environment.basicToken,
            'Stamp': await this.environment.stamp(),
            'Content-Type': CONTENT_TYPE_FORM,
            'Host': this.environment.baseUrl,
            'Connection': 'close',
            'Accept-Encoding': 'gzip, deflate',
            'User-Agent': USER_AGENT_OK_HTTP
        };
        // Using the current access token as a dummy 'refresh_token' to get a new one (workaround for missing refresh token)
        const body = new url_1.URLSearchParams({
            grant_type: 'refresh_token',
            redirect_uri: 'https://www.getpostman.com/oauth2/callback',
            refresh_token: this.session.accessToken ?? ''
        });
        const resp = await got_1.default.post(url, { headers, body: body.toString(), });
        const data = JSON.parse(resp.body);
        if (!data.access_token) {
            throw new Error(`Refresh token fetch failed: ${JSON.stringify(data)}`);
        }
        const tokenType = data.token_type || 'Bearer';
        const newRefreshToken = `${tokenType} ${data.access_token}`;
        return newRefreshToken;
    }
    async logout() {
        return 'OK';
    }
    async getVehicles() {
        if (this.session.accessToken === undefined) {
            throw 'Token not set';
        }
        try {
            const response = await got_1.default.get(`${this.environment.baseUrl}/api/v1/spa/vehicles`, {
                headers: {
                    ...this.defaultHeaders,
                    'Stamp': await this.environment.stamp(),
                },
                json: true,
            });
            this.vehicles = await (0, common_tools_1.asyncMap)(response.body.resMsg.vehicles, async (v) => {
                const vehicleProfileReponse = await got_1.default.get(`${this.environment.baseUrl}/api/v1/spa/vehicles/${v.vehicleId}/profile`, {
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
                logger_1.default.debug(`@EuropeController.getVehicles: Added vehicle ${vehicleConfig.id}`);
                return new european_vehicle_1.default(vehicleConfig, this);
            });
        }
        catch (err) {
            throw (0, common_tools_1.manageBluelinkyError)(err, 'EuropeController.getVehicles');
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
        return got_1.default.extend({
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
        return got_1.default.extend({
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
exports.EuropeanController = EuropeanController;
//# sourceMappingURL=european.controller.js.map