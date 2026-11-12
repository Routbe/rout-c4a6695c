import { createContext, useContext, type ComponentType, type ReactNode } from "react";

export interface PortalFrameProps {
  children: ReactNode;
  heading: ReactNode;
  width: "default" | "wide" | "full";
}

// A neutral injection point: public layouts never import admin navigation.
export const PortalContext = createContext<ComponentType<PortalFrameProps> | null>(null);
export const usePortalFrame = () => useContext(PortalContext);