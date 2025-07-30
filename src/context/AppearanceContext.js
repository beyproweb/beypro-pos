// src/context/AppearanceContext.js
import { createContext, useContext } from "react";

export const AppearanceContext = createContext();

export const useAppearance = () => useContext(AppearanceContext);
