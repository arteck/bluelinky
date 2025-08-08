import { AmericanController } from './controllers/american.controller';
import { EuropeanController } from './controllers/european.controller';
import { CanadianController } from './controllers/canadian.controller';
import { ChineseController } from './controllers/chinese.controller';
import { EventEmitter } from 'events';
import logger from './logger';
import { REGIONS } from './constants';
import { AustraliaController } from './controllers/australia.controller';
const DEFAULT_CONFIG = {
    username: '',
    password: '',
    region: REGIONS.US,
    brand: 'hyundai',
    autoLogin: true,
    pin: '1234',
    vin: '',
    vehicleId: undefined,
};
export class BlueLinky extends EventEmitter {
    constructor(config) {
        super();
        this.vehicles = [];
        // merge configs
        this.config = {
            ...DEFAULT_CONFIG,
            ...config,
        };
        switch (config.region) {
            case REGIONS.EU:
                this.controller = new EuropeanController(this.config);
                break;
            case REGIONS.US:
                this.controller = new AmericanController(this.config);
                break;
            case REGIONS.CA:
                this.controller = new CanadianController(this.config);
                break;
            case REGIONS.CN:
                this.controller = new ChineseController(this.config);
                break;
            case REGIONS.AU:
                this.controller = new AustraliaController(this.config);
                break;
            default:
                throw new Error('Your region is not supported yet.');
        }
        if (config.autoLogin === undefined) {
            this.config.autoLogin = true;
        }
        this.onInit();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event, listener) {
        return super.on(event, listener);
    }
    onInit() {
        if (this.config.autoLogin) {
            logger.debug('Bluelinky is logging in automatically, to disable use autoLogin: false');
            this.login();
        }
    }
    async login() {
        try {
            const response = await this.controller.login();
            // get all cars from the controller
            this.vehicles = await this.getVehicles();
            logger.debug(`Found ${this.vehicles.length} on the account`);
            this.emit('ready', this.vehicles);
            return response;
        }
        catch (error) {
            this.emit('error', error);
            return error.message;
        }
    }
    async getVehicles() {
        return (await this.controller.getVehicles()) || [];
    }
    // Note: I removed the use of ID being given here as it should be standardized that we find cars by VIN
    /**
     * Allows you to access a vehicle in your account by VIN
     * @param input - The VIN for the vehicle
     * @returns Vehicle
     */
    getVehicle(input) {
        try {
            const foundCar = this.vehicles.find(car => car.vin().toLowerCase() === input.toLowerCase());
            if (!foundCar && this.vehicles.length > 0) {
                throw new Error(`Could not find vehicle with id: ${input}`);
            }
            return foundCar;
        }
        catch (err) {
            throw new Error(`Vehicle not found: ${input}!`);
        }
    }
    async refreshAccessToken() {
        return this.controller.refreshAccessToken();
    }
    async logout() {
        return this.controller.logout();
    }
    getSession() {
        return this.controller.session;
    }
    get cachedVehicles() {
        return this.vehicles ?? [];
    }
}
export default BlueLinky;
//# sourceMappingURL=index.js.map