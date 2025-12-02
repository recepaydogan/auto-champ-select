import AsyncStorage from '@react-native-async-storage/async-storage';

export type Lane = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY' | 'FILL';

export interface FavoriteChampionConfig {
    preferences: Record<Lane, number[]>;
    autoHover: boolean;
    autoLock: boolean;
    allowFillFallback: boolean;
}

const STORAGE_KEY = 'favorite-champions';

export const lanes: Lane[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'FILL'];

export const defaultFavoriteConfig: FavoriteChampionConfig = {
    preferences: lanes.reduce((acc, lane) => {
        acc[lane] = [];
        return acc;
    }, {} as Record<Lane, number[]>),
    autoHover: true,
    autoLock: false,
    allowFillFallback: true,
};

export const normalizeLane = (lane?: string | null): Lane => {
    const normalized = (lane || '').toUpperCase();
    if (normalized.includes('TOP')) return 'TOP';
    if (normalized.includes('JUNG')) return 'JUNGLE';
    if (normalized.includes('MID')) return 'MIDDLE';
    if (normalized.includes('BOT') || normalized.includes('BOTTOM') || normalized === 'ADC') return 'BOTTOM';
    if (normalized.includes('SUP') || normalized.includes('UTIL')) return 'UTILITY';
    return 'FILL';
};

const sanitizePreferences = (prefs: Record<Lane, number[]>, maxPerLane = 3): Record<Lane, number[]> => {
    const safe: Record<Lane, number[]> = {} as Record<Lane, number[]>;
    lanes.forEach((lane) => {
        const uniq: number[] = [];
        (prefs?.[lane] || []).forEach((id) => {
            if (!id || id <= 0) return;
            if (!uniq.includes(id)) uniq.push(id);
        });
        safe[lane] = uniq.slice(0, maxPerLane);
    });
    return safe;
};

export const loadFavoriteChampionConfig = async (): Promise<FavoriteChampionConfig> => {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return { ...defaultFavoriteConfig };
        }
        const parsed = JSON.parse(raw);
        return {
            preferences: sanitizePreferences(parsed.preferences || {}),
            autoHover: parsed.autoHover ?? defaultFavoriteConfig.autoHover,
            autoLock: parsed.autoLock ?? defaultFavoriteConfig.autoLock,
            allowFillFallback: parsed.allowFillFallback ?? defaultFavoriteConfig.allowFillFallback,
        };
    } catch (error) {
        console.warn('[favorites] Failed to load favorites from storage', error);
        return { ...defaultFavoriteConfig };
    }
};

export const saveFavoriteChampionConfig = async (config: FavoriteChampionConfig) => {
    try {
        const payload: FavoriteChampionConfig = {
            preferences: sanitizePreferences(config.preferences),
            autoHover: !!config.autoHover,
            autoLock: !!config.autoLock,
            allowFillFallback: !!config.allowFillFallback,
        };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('[favorites] Failed to save favorites to storage', error);
    }
};

export const updateLanePreference = (
    config: FavoriteChampionConfig,
    lane: Lane,
    championId: number
): FavoriteChampionConfig => {
    const preferences = { ...config.preferences };
    const laneList = [...(preferences[lane] || [])];
    const existingIndex = laneList.indexOf(championId);
    if (existingIndex !== -1) {
        laneList.splice(existingIndex, 1);
    }
    if (championId > 0) {
        laneList.unshift(championId);
    }
    preferences[lane] = laneList.slice(0, 3);
    return { ...config, preferences };
};

