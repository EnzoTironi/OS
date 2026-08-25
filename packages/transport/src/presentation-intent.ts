import type {
  InteractionControlRef,
  PresentationIntentRef,
} from "../../speaker/src/index.js";

export const presentationSchema = "zoen.presentation.v1" as const;

export type ConversationalBlock =
  | { readonly kind: "text"; readonly body: string }
  | {
      readonly kind: "card";
      readonly title: string;
      readonly body: string;
      readonly fields?: readonly { readonly label: string; readonly value: string }[];
    }
  | {
      readonly kind: "button";
      readonly label: string;
      readonly controlRef: InteractionControlRef;
      readonly critical: true;
    }
  | {
      readonly kind: "link";
      readonly label: string;
      readonly url: string;
      readonly controlRef?: InteractionControlRef;
    }
  | {
      readonly kind: "file";
      readonly mediaRef: string;
      readonly mime?: string;
      readonly caption?: string;
    }
  | {
      readonly kind: "secure_web_fallback";
      readonly surfaceUrl: string;
      readonly label: string;
      readonly controlRef?: InteractionControlRef;
    };

/**
 * Conversational IR that transport lowers onto a channel.
 * Live WhatsApp does not import the archived Surface compiler.
 */
export interface PresentationIntent {
  readonly ref: PresentationIntentRef;
  readonly schema: typeof presentationSchema;
  readonly surfaceId: string;
  readonly surfaceDigest: string;
  readonly blocks: readonly ConversationalBlock[];
  readonly fullBodyText: string;
  readonly createdAt: string;
}
