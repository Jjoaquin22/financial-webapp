declare module 'react-google-recaptcha' {
  import { Component } from 'react';

  interface ReCaptchaProps {
    sitekey: string;
    onChange?: (token: string | null) => void;
    onExpired?: () => void;
    onErrored?: () => void;
    theme?: 'light' | 'dark';
    type?: 'image' | 'audio';
    tabindex?: number;
    size?: 'normal' | 'compact';
  }

  class ReCaptcha extends Component<ReCaptchaProps> {
    getValue(): string | null;
    reset(): void;
    execute(): Promise<string>;
  }

  export default ReCaptcha;
}
