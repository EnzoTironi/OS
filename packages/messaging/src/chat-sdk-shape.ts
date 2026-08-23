/**
 * Chat SDK-shaped adapter surface owned by packages/messaging.
 *
 * Deviation from synthesis: no `vercel/chat` / `@chat-adapter/*` npm dependency
 * yet — those packages are not in the workspace lockfile. This interface mirrors
 * the Card/Thread/Adapter seam so live adapters can land later without changing
 * Zoen contracts in @zoen/interaction.
 */

export interface ChatSdkThreadRef {
  readonly id: string;
  readonly kind: "chat" | "guid";
}

export interface ChatSdkUserRef {
  readonly id: string;
}

export interface ChatSdkMessage {
  readonly id: string;
  readonly thread: ChatSdkThreadRef;
  readonly from: ChatSdkUserRef;
  readonly text?: string;
  readonly callbackData?: string;
  readonly experienceToken?: string;
  readonly receivedAt: string;
}

export interface ChatSdkOutbound {
  readonly clientDeliveryId: string;
  readonly thread?: ChatSdkThreadRef;
  readonly toUser?: ChatSdkUserRef;
  readonly text: string;
  readonly buttons?: readonly { readonly label: string; readonly callbackData: string }[];
  readonly experience?: boolean;
}

export interface ChatSdkDeliveryReceipt {
  readonly messageId: string;
  readonly status: "accepted" | "rejected" | "unknown";
  readonly reason?: string;
}

/** In-process Chat SDK-shaped provider. Never exported from @zoen/interaction. */
export interface ChatSdkShapedAdapter {
  readonly providerId: string;
  parseInbound(raw: unknown): ChatSdkMessage;
  send(outbound: ChatSdkOutbound): Promise<ChatSdkDeliveryReceipt>;
}
