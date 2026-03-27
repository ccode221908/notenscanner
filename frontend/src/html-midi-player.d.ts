declare module 'html-midi-player';

declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      'midi-player': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        'sound-font'?: string;
        loop?: boolean;
      };
      'midi-visualizer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        type?: string;
      };
    }
  }
}
