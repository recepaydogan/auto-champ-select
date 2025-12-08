import { create } from 'zustand';

type AppState = {
    mapId: number | null;
    setMapId: (mapId: number | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
    mapId: null,
    setMapId: (mapId) => set({ mapId }),
}));
