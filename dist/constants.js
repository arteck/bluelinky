// moved all the US constants to its own file, we can use this file for shared constants
import { getBrandEnvironment as getCABrandEnvironment, } from './constants/canada';
import { getBrandEnvironment as getEUBrandEnvironment, } from './constants/europe';
import { getBrandEnvironment as getCNBrandEnvironment, } from './constants/china';
import { getBrandEnvironment as getAUBrandEnvironment, } from './constants/australia';
export const ALL_ENDPOINTS = {
    CA: (brand) => getCABrandEnvironment(brand).endpoints,
    EU: (brand) => getEUBrandEnvironment({ brand }).endpoints,
    CN: (brand) => getCNBrandEnvironment({ brand }).endpoints,
    AU: (brand) => getAUBrandEnvironment({ brand }).endpoints,
};
export var REGIONS;
(function (REGIONS) {
    REGIONS["US"] = "US";
    REGIONS["CA"] = "CA";
    REGIONS["EU"] = "EU";
    REGIONS["CN"] = "CN";
    REGIONS["AU"] = "AU";
})(REGIONS || (REGIONS = {}));
export const POSSIBLE_CHARGE_LIMIT_VALUES = [50, 60, 70, 80, 90, 100];
export const DEFAULT_VEHICLE_STATUS_OPTIONS = {
    refresh: false,
    parsed: false,
};
//# sourceMappingURL=constants.js.map