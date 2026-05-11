import { create } from "zustand";

type AppState = {
  uploadProgress: number;
  setUploadProgress: (value: number) => void;
  selectedClause: string;
  setSelectedClause: (value: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  uploadProgress: 72,
  setUploadProgress: (uploadProgress) => set({ uploadProgress }),
  selectedClause: "DC Tenant Estoppel Certificate",
  setSelectedClause: (selectedClause) => set({ selectedClause }),
}));
