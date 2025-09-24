"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSession = void 0;
const got_1 = __importDefault(require("got"));
const tough_cookie_1 = require("tough-cookie");
async function initSession(environment, cookies) {
    const cookieJar = cookies ?? new tough_cookie_1.CookieJar();
    await (0, got_1.default)(environment.endpoints.session, { cookieJar });
    // Language endpoint now requires authentication, so we skip it
    // Language will be set in the authentication URL instead
    return cookieJar;
}
exports.initSession = initSession;
//# sourceMappingURL=authStrategy.js.map