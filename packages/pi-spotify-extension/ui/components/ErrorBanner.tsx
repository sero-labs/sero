interface ErrorBannerProps {
  variant: 'error' | 'info';
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ variant, message, onDismiss }: ErrorBannerProps) {
  const isInfo = variant === 'info';

  return (
    <div className={`sp-error-banner ${isInfo ? 'sp-error-banner--info' : ''}`}>
      <span className="sp-error-banner__icon">{isInfo ? 'ℹ️' : '⚠️'}</span>
      <span className="sp-error-banner__text">{message}</span>
      {onDismiss ? (
        <button
          className="sp-error-banner__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
