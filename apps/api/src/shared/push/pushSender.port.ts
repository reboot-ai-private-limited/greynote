/** What the phone receives. `data` values are strings (an FCM rule); `route` tells the app which screen to open on tap. */
export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Tokens Firebase says no longer exist — the caller removes them. */
  deadTokens: string[];
}

/** Delivers a message to phones. Never throws: a push is a nudge, the Inbox row is the record. */
export interface PushSenderPort {
  send(tokens: string[], message: PushMessage): Promise<PushResult>;
}
