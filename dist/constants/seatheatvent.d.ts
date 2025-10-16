import { Brand } from '../interfaces/common.interfaces';
import { REGION } from '../constants';
export type advClimateMap = {
    validSeats: {
        [key: string]: string;
    };
    validStatus: number[];
    validHeats: number[];
};
export declare const advClimateValidator: (brand: Brand, region: REGION) => advClimateMap;
