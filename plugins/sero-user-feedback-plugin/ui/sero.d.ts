import type { SeroUserFeedbackBridge } from '@sero/common';

declare global {
  interface Window {
    sero: {
      userFeedback: SeroUserFeedbackBridge;
    };
  }
}

export {};
