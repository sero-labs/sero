import type { SeroUserFeedbackBridge } from '@sero-ai/common';

declare global {
  interface Window {
    sero: {
      userFeedback: SeroUserFeedbackBridge;
    };
  }
}

export {};
