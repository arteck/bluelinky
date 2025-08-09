import { readFile } from 'fs';
import { promisify } from 'util';
import got from 'got';
import { hyundaiCFB as australiaHyundaiCFB, kiaCFB as australiaKiaCFB } from './australia.cfb';
import { hyundaiCFB as europeHyundaiCFB, kiaCFB as europeKiaCFB } from './europe.cfb';
import { REGIONS } from '../constants';
export var StampMode;
(function (StampMode) {
    StampMode["LOCAL"] = "LOCAL";
    StampMode["DISTANT"] = "DISTANT";
})(StampMode || (StampMode = {}));
const cachedStamps = new Map();
const getAndCacheStampsFromFile = async (file, stampHost, stampsFile = `${stampHost}${file}.v2.json`) => {
    if (stampsFile.startsWith('file://')) {
        const [, path] = stampsFile.split('file://');
        const content = await promisify(readFile)(path);
        return JSON.parse(content.toString('utf-8'));
    }
    const { body } = await got(stampsFile, { json: true });
    cachedStamps.set(file, body);
    return body;
};
export const getStampFromFile = (stampFileKey, stampHost, stampsFile) => async () => {
    const { stamps, generated, frequency } = cachedStamps.get(stampFileKey) ??
        (await getAndCacheStampsFromFile(stampFileKey, stampHost, stampsFile));
    const generatedDate = new Date(generated);
    const millisecondsSinceStampsGeneration = Date.now() - generatedDate.getTime();
    const position = Math.floor(millisecondsSinceStampsGeneration / frequency);
    if (position / (stamps.length - 1) >= 0.9) {
        cachedStamps.delete(stampFileKey);
    }
    return stamps[Math.min(position, stamps.length - 1)];
};
const xorBuffers = (a, b) => {
    if (a.length !== b.length) {
        throw new Error(`XOR Buffers are not the same size ${a.length} vs ${b.length}`);
    }
    const outBuffer = Buffer.alloc(a.length);
    for (let i = 0; i < outBuffer.length; i++) {
        outBuffer.writeUInt8(a[i] ^ b[i], i);
    }
    return outBuffer;
};
const getCFB = (brand, region) => {
    switch (region) {
        case REGIONS.AU:
            return brand === 'kia' ? australiaKiaCFB : australiaHyundaiCFB;
        case REGIONS.EU:
            return brand === 'kia' ? europeKiaCFB : europeHyundaiCFB;
        default:
            throw new Error('Local stamp generation is only supported in Australia and Europe');
    }
};
export const getStampFromCFB = (appId, brand, region) => {
    const cfb = getCFB(brand, region);
    return async () => {
        const rawData = Buffer.from(`${appId}:${Date.now()}`, 'utf-8');
        return Promise.resolve(xorBuffers(cfb, rawData).toString('base64'));
    };
};
export const getStampGenerator = ({ appId, brand, mode, region, stampHost, stampsFile, }) => {
    switch (mode) {
        case StampMode.LOCAL:
            return getStampFromCFB(appId, brand, region);
        case StampMode.DISTANT:
        default:
            return getStampFromFile(`${brand}-${appId}`, stampHost, stampsFile);
    }
};
//# sourceMappingURL=stamps.js.map