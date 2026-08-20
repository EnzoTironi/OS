import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { SurfaceDocument, SurfaceRuntimeData } from "../model.js";

export interface SurfaceInteraction {
  readonly commit: (bindingId: string) => Promise<void>;
  readonly data: SurfaceRuntimeData;
  readonly document: SurfaceDocument;
  readonly fieldValue: (bindingId: string, inputId: string) => string | boolean;
  readonly propose: (bindingId: string) => Promise<void>;
  readonly setFieldValue: (
    bindingId: string,
    inputId: string,
    value: string | boolean,
  ) => void;
}

const InteractionContext = createContext<SurfaceInteraction | undefined>(
  undefined,
);

export function SurfaceInteractionProvider(props: {
  readonly children: ReactNode;
  readonly value: SurfaceInteraction;
}) {
  return (
    <InteractionContext.Provider value={props.value}>
      {props.children}
    </InteractionContext.Provider>
  );
}

export function useSurfaceInteraction(): SurfaceInteraction {
  const interaction = useContext(InteractionContext);
  if (interaction === undefined) {
    throw new Error("Surface renderer requires SurfaceInteractionProvider");
  }
  return interaction;
}
