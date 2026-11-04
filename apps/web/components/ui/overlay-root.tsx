"use client";

import { createContext, useContext } from "react";

// Where floating layers portal to. Default (null) is document.body; the /design kit sets each themed panel so a
// dialog opened in the light panel is light too (portals otherwise escape the panel's data-theme).
const Root = createContext<HTMLElement | null>(null);
export const OverlayRoot = Root.Provider;
export const useOverlayRoot = () => useContext(Root) ?? undefined;
